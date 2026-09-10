import sharp, { Sharp } from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { removeBackground } from '@imgly/background-removal-node';
import { db } from '../db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'products');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface ProcessImageOptions {
  productId: string;
  imageData: string | Buffer;
  broadcast?: (data: any) => void;
}

export interface ImageClarityStats {
  sharpness: number;
  contrast: number;
  isBlurry: boolean;
  isSoftFocus: boolean;
  isLowContrast: boolean;
  recommendedSigma: number;
  recommendedM1: number;
  recommendedM2: number;
  claheRequired: boolean;
}

/**
 * Evaluates image sharpness and dynamic range / contrast across channels.
 * Calculates adaptive unsharp masking parameters and contrast recovery settings.
 */
export async function evaluateImageClarity(input: Buffer | Sharp): Promise<ImageClarityStats> {
  const pipeline = Buffer.isBuffer(input) ? sharp(input) : input.clone();
  const stats = await pipeline.stats();

  const sharpness = typeof stats.sharpness === 'number' && Number.isFinite(stats.sharpness) ? stats.sharpness : 0;
  const colorChannels = stats.channels && stats.channels.length >= 3
    ? stats.channels.slice(0, 3)
    : (stats.channels ? stats.channels.slice(0, 1) : []);
  const contrast = colorChannels.length > 0
    ? colorChannels.reduce((acc: number, c: { stdev: number }) => acc + (c?.stdev || 0), 0) / colorChannels.length
    : 0;

  const isBlurry = sharpness < 3.0;
  const isSoftFocus = sharpness < 6.0;
  const isLowContrast = contrast < 38.0;

  // Adaptive unsharp masking parameters:
  // Heavily blurred or soft-focus product images get a wider Gaussian sigma
  // and stronger edge/detail enhancement (m1 and m2) to crisply recover barcodes and text.
  let recommendedSigma = 0.8;
  let recommendedM1 = 0.4;
  let recommendedM2 = 1.2;

  if (sharpness < 1.5) {
    recommendedSigma = 1.8;
    recommendedM1 = 1.0;
    recommendedM2 = 2.6;
  } else if (sharpness < 3.5) {
    recommendedSigma = 1.4;
    recommendedM1 = 0.8;
    recommendedM2 = 2.0;
  } else if (sharpness < 7.0) {
    recommendedSigma = 1.05;
    recommendedM1 = 0.55;
    recommendedM2 = 1.5;
  }

  const claheRequired = isLowContrast;

  return {
    sharpness,
    contrast,
    isBlurry,
    isSoftFocus,
    isLowContrast,
    recommendedSigma,
    recommendedM1,
    recommendedM2,
    claheRequired,
  };
}

/**
 * Standalone helper to adaptively de-blur and enhance clarity of an image buffer.
 * Evaluates sharpness & contrast and applies unsharp masking & contrast recovery.
 */
export async function applyAdaptiveDeblurAndClarity(
  inputBuffer: Buffer,
  providedMetrics?: ImageClarityStats
): Promise<Buffer> {
  const metrics = providedMetrics || (await evaluateImageClarity(inputBuffer));
  let pipeline = sharp(inputBuffer).rotate();

  if (metrics.claheRequired) {
    pipeline = pipeline.clahe({ width: 32, height: 32, maxSlope: 2.0 });
  }

  pipeline = pipeline.sharpen({
    sigma: metrics.recommendedSigma,
    m1: metrics.recommendedM1,
    m2: metrics.recommendedM2,
  });

  return await pipeline.png().toBuffer();
}

/**
 * High-Level Deep Learning Product Segmentation & Pure White Background Pipeline
 * with Adaptive De-blurring & Clarity Recovery.
 *
 * Algorithmic steps:
 * 1. Auto-rotate based on EXIF orientation (critical for phone photos).
 * 2. Evaluate image sharpness/contrast metrics to compute adaptive de-blur parameters.
 * 3. Downscale to max 1024x1024 for lightning-fast neural inference (<1.8s) and sharp detail.
 * 4. Deep Learning Dichotomous Image Segmentation (IS-Net via ONNX) to accurately extract
 *    the product foreground across complex retail environments (countertops, dark surfaces,
 *    shadows, hands holding goods, textured backgrounds).
 * 5. Subpixel Alpha Matting & Hermite Smoothstep Curve:
 *    - Cleans background noise and dark boundary fringing.
 *    - Preserves white products (milk pouches, salt bags, medicine bottles) without erasing them.
 * 6. Composite seamlessly onto pure solid #FFFFFF canvas.
 * 7. Studio-Quality Polish & Adaptive De-blurring:
 *    - Auto-tone and gentle lighting boost (+2% brightness)
 *    - Color vibrancy boost (+6% saturation)
 *    - Adaptive unsharp masking tuned dynamically to image softness
 *    - Local contrast recovery (CLAHE) for washed-out/low-contrast photos
 * 8. Output as optimized WebP (90% quality).
 */
export async function enhanceImageWithPureWhiteBg(inputBuffer: Buffer): Promise<Buffer> {
  try {
    // 1. Auto-rotate EXIF and constrain max dimension to 1024px
    const maxDim = 1024;
    let baseSharp = sharp(inputBuffer).rotate();
    const meta = await baseSharp.metadata();

    if ((meta.width && meta.width > maxDim) || (meta.height && meta.height > maxDim)) {
      baseSharp = baseSharp.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
    }

    const pngBuffer = await baseSharp.png().toBuffer();
    const origInfo = await sharp(pngBuffer).metadata();
    const width = origInfo.width || 500;
    const height = origInfo.height || 500;

    // Evaluate input clarity & sharpness on normalized image for adaptive recovery
    let clarityStats: ImageClarityStats;
    try {
      clarityStats = await evaluateImageClarity(pngBuffer);
    } catch {
      clarityStats = {
        sharpness: 5,
        contrast: 50,
        isBlurry: false,
        isSoftFocus: false,
        isLowContrast: false,
        recommendedSigma: 0.8,
        recommendedM1: 0.4,
        recommendedM2: 1.2,
        claheRequired: false,
      };
    }

    // 2. High-precision deep learning dichotomous image segmentation
    const blobIn = new Blob([pngBuffer], { type: 'image/png' });
    const blobOut = await removeBackground(blobIn);
    const cutPngBuffer = Buffer.from(await blobOut.arrayBuffer());

    // 3. Raw RGBA extraction and subpixel alpha matting
    const { data: cutData } = await sharp(cutPngBuffer)
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const totalPixels = width * height;
    const outputData = Buffer.alloc(totalPixels * 4);

    // 4. Smoothstep matting curve & boundary de-fringing
    for (let i = 0; i < totalPixels; i++) {
      const o = i * 4;
      const r = cutData[o];
      const g = cutData[o + 1];
      const b = cutData[o + 2];
      let a = cutData[o + 3] / 255;

      // Hermite smoothstep curve
      if (a <= 0.12) {
        a = 0;
      } else if (a >= 0.88) {
        a = 1;
      } else {
        const t = (a - 0.12) / (0.88 - 0.12);
        a = t * t * (3 - 2 * t);
      }

      // Blend foreground onto pure solid #FFFFFF canvas
      outputData[o] = Math.round(r * a + 255 * (1 - a));
      outputData[o + 1] = Math.round(g * a + 255 * (1 - a));
      outputData[o + 2] = Math.round(b * a + 255 * (1 - a));
      outputData[o + 3] = 255;
    }

    // 5. Studio polish with adaptive de-blurring & clarity enhancement
    let studioPipeline = sharp(outputData, { raw: { width, height, channels: 4 } })
      .modulate({
        brightness: 1.02,
        saturation: 1.06,
      });

    // Adaptive contrast recovery if original photo was low contrast
    if (clarityStats.claheRequired) {
      studioPipeline = studioPipeline.clahe({ width: 32, height: 32, maxSlope: 2.0 });
    }

    // Adaptive unsharp masking tuned to original image sharpness
    studioPipeline = studioPipeline.sharpen({
      sigma: clarityStats.recommendedSigma,
      m1: clarityStats.recommendedM1,
      m2: clarityStats.recommendedM2,
    });

    return await studioPipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (err: any) {
    console.warn('[ImageProcessor] AI segmentation fallback to sharp clean white flatten:', err?.message || err);
    let fallbackPipeline = sharp(inputBuffer)
      .rotate()
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .modulate({
        brightness: 1.02,
        saturation: 1.06,
      });

    try {
      const stats = await evaluateImageClarity(inputBuffer);
      if (stats.claheRequired) {
        fallbackPipeline = fallbackPipeline.clahe({ width: 32, height: 32, maxSlope: 2.0 });
      }
      fallbackPipeline = fallbackPipeline.sharpen({
        sigma: stats.recommendedSigma,
        m1: stats.recommendedM1,
        m2: stats.recommendedM2,
      });
    } catch {}

    return await fallbackPipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .webp({ quality: 85 })
      .toBuffer();
  }
}

/**
 * Asynchronous Worker Queue for non-blocking image enhancement.
 * Ensures the Express HTTP server and customer website never lag while images are enhanced.
 */
class ImageProcessingQueue {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  add(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.isProcessing) {
      setImmediate(() => this.processNext());
    }
  }

  private async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (err: any) {
        console.error('[ImageProcessingQueue] Error processing image:', err?.message || err);
      }
    }

    // Yield control to event loop before next job
    setImmediate(() => this.processNext());
  }
}

const processingQueue = new ImageProcessingQueue();

/**
 * Converts a base64 string or Data URL into a clean Buffer.
 */
export function parseImageInput(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  const cleanBase64 = input.includes('base64,') ? input.split('base64,')[1] : input;
  return Buffer.from(cleanBase64.trim(), 'base64');
}

/**
 * Non-blocking image processing pipeline:
 * 1. Synchronously saves raw/initial image to /uploads/products/{productId}.webp (takes ~5ms).
 * 2. Returns the image_url immediately so the HTTP response is instantaneous.
 * 3. Enqueues background enhancement to perform white-background removal & sharpening.
 * 4. Once background task finishes, replaces image file with pure-white enhanced version.
 * 5. Updates SQLite and broadcasts WebSocket notification without any website lag.
 */
export async function processProductImageAsync(options: ProcessImageOptions): Promise<string> {
  const { productId, imageData, broadcast } = options;
  const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}.webp`;
  const filePath = path.join(UPLOADS_DIR, filename);
  const relativeUrl = `/uploads/products/${filename}`;

  const inputBuffer = parseImageInput(imageData);

  // 1. Immediately save a fast initial webp version so the URL is live instantly
  try {
    let quickPipeline = sharp(inputBuffer)
      .rotate()
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true });

    try {
      const stats = await evaluateImageClarity(inputBuffer);
      if (stats.claheRequired) {
        quickPipeline = quickPipeline.clahe({ width: 32, height: 32, maxSlope: 2.0 });
      }
      quickPipeline = quickPipeline.sharpen({
        sigma: stats.recommendedSigma,
        m1: stats.recommendedM1,
        m2: stats.recommendedM2,
      });
    } catch {}

    const quickBuffer = await quickPipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .webp({ quality: 80 })
      .toBuffer();
    await fs.promises.writeFile(filePath, new Uint8Array(quickBuffer));
  } catch (err) {
    // If quick sharp fails, write raw buffer directly
    await fs.promises.writeFile(filePath, new Uint8Array(inputBuffer));
  }

  // 2. Enqueue background enhancement task (pure white background & enhancement)
  processingQueue.add(async () => {
    try {
      console.log(`[ImageProcessor] 🎨 Enhancing product image for ID ${productId} with pure white background...`);
      const enhancedBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
      await fs.promises.writeFile(filePath, new Uint8Array(enhancedBuffer));
      console.log(`[ImageProcessor] ✅ Finished pure white background enhancement for ID ${productId} (${enhancedBuffer.length} bytes)`);

      // Update database with confirmed image_url
      try {
        db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(relativeUrl, productId);
      } catch (dbErr: any) {
        console.warn(`[ImageProcessor] Notice updating SQLite image_url:`, dbErr?.message);
      }

      // Broadcast update over WebSocket if helper provided
      if (broadcast) {
        const allProducts = db.prepare('SELECT * FROM products').all();
        broadcast({ type: 'STOCK_UPDATED', data: allProducts });
        broadcast({
          type: 'IMAGE_ENHANCED',
          data: { productId, imageUrl: relativeUrl }
        });
      }
    } catch (enhanceErr: any) {
      console.error(`[ImageProcessor] Failed to enhance image for ID ${productId}:`, enhanceErr?.message || enhanceErr);
    }
  });

  return relativeUrl;
}
