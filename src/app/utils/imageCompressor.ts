/**
 * Client-side image compression utility for mobile camera photos.
 * Prevents mobile memory exhaustion (OOM), tab reloads, and heavy multi-megabyte payloads
 * by downscaling high-resolution device photos (often 12MP - 48MP) to max 1200px
 * and 0.88 JPEG quality before sending over HTTP.
 *
 * Employs zero-heap duplication via createImageBitmap / URL.createObjectURL
 * to avoid crashes and unexpected exits on RAM-constrained mobile phones.
 */

export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 1200,
  quality = 0.88
): Promise<string> {
  if (!file) return '';

  // 1. Ultra-fast hardware decode path via createImageBitmap (avoids JS-heap base64 string bloat)
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await (window.createImageBitmap as any)(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await window.createImageBitmap(file);
      }
      let width = bitmap.width;
      let height = bitmap.height;

      const scale = Math.min(1, maxDim / Math.max(width, height, 1));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', quality);
      }
      bitmap.close();
    } catch {
      // If createImageBitmap fails on specific camera format, fall through to object URL
    }
  }

  // 2. Blob Object URL path (avoids Base64 memory duplication in JS heap)
  if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
    try {
      return await new Promise<string>((resolve, reject) => {
        const objectUrl = window.URL.createObjectURL(file);
        const img = new Image();
        img.onerror = () => {
          window.URL.revokeObjectURL(objectUrl);
          fallbackFileReader(file, maxDim, quality).then(resolve).catch(reject);
        };
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            const scale = Math.min(1, maxDim / Math.max(width, height, 1));
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve('');
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) {
            reject(e);
          } finally {
            window.URL.revokeObjectURL(objectUrl);
          }
        };
        img.src = objectUrl;
      });
    } catch {
      // Fall through to fallback
    }
  }

  // 3. Fallback FileReader path (for Node.js / unit tests / older webviews)
  return fallbackFileReader(file, maxDim, quality);
}

/**
 * Captures a single frame from an active HTML5 Video stream and compresses it
 * directly to a JPEG data URL. Avoids memory bloat and intermediate file creation.
 */
export function captureVideoFrameToDataUrl(
  video: HTMLVideoElement,
  maxDim = 1200,
  quality = 0.88
): string {
  if (!video || !video.videoWidth || !video.videoHeight) {
    return '';
  }

  let width = video.videoWidth;
  let height = video.videoHeight;

  const scale = Math.min(1, maxDim / Math.max(width, height, 1));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function fallbackFileReader(
  file: File,
  maxDim = 1200,
  quality = 0.88
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      if (typeof window === 'undefined' || !window.Image) {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height || (width <= maxDim && height <= maxDim)) {
          resolve(rawDataUrl);
          return;
        }

        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Rotates an image Data URL by a given angle (e.g. 90, 180, 270 degrees clockwise).
 * Returns the rotated image as a Data URL.
 * Handles 0 degrees and non-browser/invalid inputs gracefully.
 */
export async function rotateImageDataUrl(
  dataUrl: string,
  degrees: number,
  quality = 0.90
): Promise<string> {
  const normalizedDegrees = ((Math.round(degrees) % 360) + 360) % 360;
  if (normalizedDegrees === 0 || !dataUrl) {
    return dataUrl;
  }

  if (typeof window === 'undefined' || !window.Image) {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (!width || !height) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        if (normalizedDegrees === 90 || normalizedDegrees === 270) {
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }

        const isPng = dataUrl.startsWith('data:image/png');
        const mimeType = isPng ? 'image/png' : 'image/jpeg';

        // Fill white background for JPEG exports to prevent transparent black border artifacts
        if (!isPng && typeof ctx.fillRect === 'function') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();
        if (normalizedDegrees === 90) {
          ctx.translate(canvas.width, 0);
          ctx.rotate((90 * Math.PI) / 180);
        } else if (normalizedDegrees === 180) {
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate((180 * Math.PI) / 180);
        } else if (normalizedDegrees === 270) {
          ctx.translate(0, canvas.height);
          ctx.rotate((270 * Math.PI) / 180);
        } else {
          // General arbitrary angle rotation fallback
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((normalizedDegrees * Math.PI) / 180);
          ctx.translate(-width / 2, -height / 2);
        }

        ctx.drawImage(img, 0, 0);
        ctx.restore();

        resolve(canvas.toDataURL(mimeType, quality));
      } catch (err) {
        console.warn('[rotateImageDataUrl] Canvas rotation error:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
