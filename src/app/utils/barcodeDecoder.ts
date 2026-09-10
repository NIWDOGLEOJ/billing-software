import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';

export const SUPPORTED_BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
  'aztec',
  'pdf417',
];

export const ZXING_BARCODE_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
];

/**
 * Creates a pre-configured ZXing BrowserMultiFormatReader with TRY_HARDER enabled
 * and all standard 1D & 2D barcode symbologies.
 */
export function createConfiguredZxingReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_BARCODE_FORMATS);
  return new BrowserMultiFormatReader(hints);
}

/**
 * Checks whether the current runtime environment is a Secure Context with live
 * getUserMedia camera access (HTTPS or localhost).
 */
export function hasLiveCameraSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return Boolean(
    window.isSecureContext !== false &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export interface LiveBarcodeScannerOptions {
  videoElement: HTMLVideoElement;
  onScan: (barcode: string, format?: string) => void;
  onError?: (err: any) => void;
  /** Optional callback fired when a scanned frame contains no barcode (cleared view) */
  onNoBarcode?: () => void;
  /** Scan throttling interval in ms (default: 80ms for ultra-responsive live detection) */
  scanIntervalMs?: number;
}

export interface LiveBarcodeScannerController {
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Requests an active camera stream with ideal settings for live barcode scanning:
 * rear-facing environment lens, autofocus, and 30fps video.
 * Fallbacks gracefully if high-resolution constraints are not supported by the hardware.
 */
export async function requestLiveCameraStream(
  preferredFacingMode: 'environment' | 'user' = 'environment'
): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('CAMERA_GUM_UNAVAILABLE');
  }

  // Attempt 1: Optimal mobile barcode scanning constraints (720p/1080p, autofocus, 30fps)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredFacingMode },
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        frameRate: { ideal: 30, min: 15 },
      },
      audio: false,
    });
    await applyOptimalContinuousAutofocus(stream);
    return stream;
  } catch (err: any) {
    console.warn('[BarcodeDecoder] High-res constraints rejected, attempting basic facingMode:', err);
  }

  // Attempt 2: Relaxed constraints with facingMode
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: preferredFacingMode } },
      audio: false,
    });
    await applyOptimalContinuousAutofocus(stream);
    return stream;
  } catch (err: any) {
    console.warn('[BarcodeDecoder] FacingMode constraints rejected, attempting generic video:', err);
  }

  // Attempt 3: Basic video fallback
  const fallbackStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  await applyOptimalContinuousAutofocus(fallbackStream);
  return fallbackStream;
}

/**
 * Applies continuous hardware autofocus on the video track if supported by the camera device.
 */
export async function applyOptimalContinuousAutofocus(stream: MediaStream): Promise<void> {
  try {
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities() as any;
      const advanced: any = {};
      if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        advanced.focusMode = 'continuous';
      }
      if (caps.exposureMode && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
        advanced.exposureMode = 'continuous';
      }
      if (caps.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
        advanced.whiteBalanceMode = 'continuous';
      }
      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] } as any);
      }
    }
  } catch {
    // Unsupported by hardware, proceed silently
  }
}

/**
 * Checks whether the active camera video track supports torch / flashlight mode.
 */
export function hasTorchSupport(stream: MediaStream | null): boolean {
  if (!stream) return false;
  try {
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities() as any;
      return Boolean(caps.torch);
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Toggles the camera torch / flashlight on mobile devices if supported.
 */
export async function toggleCameraTorch(stream: MediaStream | null, enable: boolean): Promise<boolean> {
  if (!stream) return false;
  try {
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities() as any;
      if (caps.torch) {
        await track.applyConstraints({ advanced: [{ torch: enable }] } as any);
        return true;
      }
    }
  } catch (err) {
    console.warn('[BarcodeDecoder] Failed to toggle camera torch:', err);
  }
  return false;
}

/**
 * Safely resolves the native BarcodeDetector constructor across browser, globalThis, and window.
 */
export function getBarcodeDetectorClass(): any {
  if (typeof window !== 'undefined' && (window as any).BarcodeDetector) {
    return (window as any).BarcodeDetector;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).BarcodeDetector) {
    return (globalThis as any).BarcodeDetector;
  }
  if (typeof global !== 'undefined' && (global as any).BarcodeDetector) {
    return (global as any).BarcodeDetector;
  }
  return undefined;
}

/**
 * Starts a live, continuous barcode scanner on a video element.
 * Prioritizes native hardware-accelerated BarcodeDetector (Chrome Android, modern Safari)
 * with seamless fallback to ZXing continuous reader at high frame rate.
 */
export function startLiveBarcodeScanner(options: LiveBarcodeScannerOptions): LiveBarcodeScannerController {
  const { videoElement, onScan, onError, onNoBarcode, scanIntervalMs = 80 } = options;
  let isRunning = true;
  let timerId: any = null;
  let zxingReader: BrowserMultiFormatReader | null = null;

  // Pass 1: Hardware-accelerated native BarcodeDetector if available in browser
  const BarcodeDetectorClass = getBarcodeDetectorClass();
  if (BarcodeDetectorClass) {
    let detector: any = null;
    try {
      detector = new BarcodeDetectorClass({ formats: SUPPORTED_BARCODE_FORMATS });
    } catch {
      try {
        // W3C Barcode Detection API fallback: no args searches all supported formats without throwing
        detector = new BarcodeDetectorClass();
      } catch (e) {
        console.warn('[BarcodeDecoder] Native BarcodeDetector init failed, will use ZXing:', e);
      }
    }

    if (detector) {
      let isDetecting = false;

      const detectFrame = async () => {
        if (!isRunning) return;

        if (
          !isDetecting &&
          videoElement &&
          videoElement.readyState >= 2 &&
          videoElement.videoWidth > 0 &&
          videoElement.videoHeight > 0
        ) {
          isDetecting = true;
          try {
            const barcodes = await detector.detect(videoElement);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue && isRunning) {
              onScan(barcodes[0].rawValue, barcodes[0].format);
            } else if (isRunning && onNoBarcode) {
              onNoBarcode();
            }
          } catch (detErr) {
            // Frame detection error during rotation or temporary drop - ignore and continue
          } finally {
            isDetecting = false;
          }
        }

        if (isRunning) {
          timerId = setTimeout(detectFrame, scanIntervalMs);
        }
      };

      timerId = setTimeout(detectFrame, 50);

      return {
        stop: () => {
          isRunning = false;
          if (timerId) clearTimeout(timerId);
        },
        isRunning: () => isRunning,
      };
    }
  }

  // Pass 2: High frame-rate continuous ZXing decode fallback
  try {
    zxingReader = createConfiguredZxingReader();
    zxingReader.timeBetweenDecodingAttempts = scanIntervalMs;

    zxingReader.decodeFromVideoElementContinuously(videoElement, (result, err) => {
      if (!isRunning) return;
      if (result && result.getText()) {
        onScan(result.getText(), result.getBarcodeFormat()?.toString());
      } else if (isRunning && onNoBarcode && err && err.name === 'NotFoundException') {
        onNoBarcode();
      }
      if (err && onError && err.name !== 'NotFoundException') {
        onError(err);
      }
    });
  } catch (err) {
    console.error('[BarcodeDecoder] ZXing continuous decode failed to initialize:', err);
    if (onError) onError(err);
  }

  return {
    stop: () => {
      isRunning = false;
      if (timerId) clearTimeout(timerId);
      if (zxingReader) {
        try {
          zxingReader.stopContinuousDecode();
          // DO NOT call zxingReader.reset() because reset() nullifies videoElement.srcObject
        } catch {
          // ignore reset error
        }
      }
    },
    isRunning: () => isRunning,
  };
}

/**
 * Loads an image File or Blob into an HTMLImageElement safely.
 */
function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

/**
 * Renders an image element onto a resized canvas with optional rotation and contrast normalization.
 */
function renderOptimizedCanvas(
  img: HTMLImageElement,
  maxDimension: number = 1280,
  rotationDeg: number = 0,
  boostContrast: boolean = false
): HTMLCanvasElement {
  let { naturalWidth: width, naturalHeight: height } = img;
  if (!width || !height) {
    width = img.width || 640;
    height = img.height || 480;
  }

  // Scale down high-resolution smartphone photos (e.g. 12MP-48MP) to optimal barcode scanning size
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  const is90or270 = rotationDeg === 90 || rotationDeg === 270;
  canvas.width = is90or270 ? targetH : targetW;
  canvas.height = is90or270 ? targetW : targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
  ctx.restore();

  if (boostContrast) {
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      // High contrast linear stretch
      for (let i = 0; i < d.length; i += 4) {
        // Luminance
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const boosted = gray > 128 ? Math.min(255, gray * 1.2) : Math.max(0, gray * 0.8);
        d[i] = boosted;
        d[i + 1] = boosted;
        d[i + 2] = boosted;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Ignore canvas security errors
    }
  }

  return canvas;
}

/**
 * Decodes a barcode from an image File/Blob captured by mobile camera or selected from device gallery.
 * Utilizes native BarcodeDetector if present, falling back to multi-pass ZXing with auto-scaling.
 */
export async function decodeBarcodeFromFile(file: File | Blob): Promise<string | null> {
  if (!file) return null;

  // Pass 1: If native hardware-accelerated BarcodeDetector is available
  const BarcodeDetectorClass = getBarcodeDetectorClass();
  if (BarcodeDetectorClass) {
    try {
      const detector = new BarcodeDetectorClass({ formats: SUPPORTED_BARCODE_FORMATS });
      const img = await loadImageElement(file);
      const barcodes = await detector.detect(img);
      if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
        return barcodes[0].rawValue;
      }
    } catch (e) {
      console.warn('[BarcodeDecoder] Native BarcodeDetector error, falling back to ZXing:', e);
    }
  }

  const reader = createConfiguredZxingReader();

  // Pass 2: Direct decode via Object URL using configured ZXing reader
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const result = await reader.decodeFromImageUrl(objectUrl);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch (directErr) {
    // Expected if direct decode needs downscaling or rotation
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // Pass 3: Downscaled standard resolution (1280px)
  try {
    const img = await loadImageElement(file);
    const canvas = renderOptimizedCanvas(img, 1280, 0, false);
    const result = await reader.decodeFromCanvasElement(canvas);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to next pass
  }

  // Pass 4: 90° rotated canvas (in case user photographed a horizontal barcode holding phone vertically)
  try {
    const img = await loadImageElement(file);
    const canvas90 = renderOptimizedCanvas(img, 1280, 90, false);
    const result = await reader.decodeFromCanvasElement(canvas90);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Continue to next pass
  }

  // Pass 5: Contrast enhanced pass
  try {
    const img = await loadImageElement(file);
    const canvasContrast = renderOptimizedCanvas(img, 1024, 0, true);
    const result = await reader.decodeFromCanvasElement(canvasContrast);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Not found
  }

  return null;
}
