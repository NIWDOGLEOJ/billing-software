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
