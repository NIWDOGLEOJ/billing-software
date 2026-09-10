import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  enhanceImageWithPureWhiteBg,
  parseImageInput,
  processProductImageAsync,
  evaluateImageClarity,
  applyAdaptiveDeblurAndClarity
} from './imageProcessor';
import { db, initDb } from '../db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'products');

describe('Product Camera & Pure White Background Image Enhancement Pipeline', () => {
  beforeAll(() => {
    initDb();
  });

  it('correctly parses base64 data URLs, raw base64, and buffers', () => {
    const rawString = 'Hello Vitest Image Test';
    const rawBuffer = Buffer.from(rawString, 'utf-8');
    const base64Str = rawBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Str}`;

    expect(parseImageInput(rawBuffer).toString('utf-8')).toBe(rawString);
    expect(parseImageInput(base64Str).toString('utf-8')).toBe(rawString);
    expect(parseImageInput(dataUrl).toString('utf-8')).toBe(rawString);
  });

  it('enhances image and converts non-white background to pure white (#FFFFFF)', async () => {
    const width = 300;
    const height = 300;
    const raw = Buffer.alloc(width * height * 4);

    // Create a realistic non-white background (grey/warm countertop gradient: 185-205)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const bgVal = 185 + Math.floor((y / height) * 20);
        raw[idx] = bgVal;
        raw[idx + 1] = bgVal - 5;
        raw[idx + 2] = bgVal - 10;
        raw[idx + 3] = 255;
      }
    }

    // Draw foreground product in center (e.g., green spice box with red badge)
    for (let y = 80; y <= 220; y++) {
      for (let x = 90; x <= 210; x++) {
        const idx = (y * width + x) * 4;
        if (y >= 120 && y <= 160 && x >= 120 && x <= 180) {
          // Red badge
          raw[idx] = 220;
          raw[idx + 1] = 30;
          raw[idx + 2] = 30;
        } else {
          // Green box
          raw[idx] = 20;
          raw[idx + 1] = 140;
          raw[idx + 2] = 50;
        }
      }
    }

    // Add shadow cast by the product onto the table
    for (let y = 221; y <= 245; y++) {
      for (let x = 85; x <= 215; x++) {
        const idx = (y * width + x) * 4;
        raw[idx] = Math.floor(raw[idx] * 0.7);
        raw[idx + 1] = Math.floor(raw[idx + 1] * 0.7);
        raw[idx + 2] = Math.floor(raw[idx + 2] * 0.7);
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();

    // Run enhancement and background replacement
    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    expect(outputBuffer).toBeInstanceOf(Buffer);
    expect(outputBuffer.length).toBeGreaterThan(0);

    // Inspect output pixels
    const { data: outData, info: outInfo } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });
    expect(outInfo.width).toBe(width);
    expect(outInfo.height).toBe(height);

    // Verify perimeter corners are pure white #FFFFFF
    const topLeft = [outData[0], outData[1], outData[2]];
    const topRightIdx = (width - 1) * 3;
    const topRight = [outData[topRightIdx], outData[topRightIdx + 1], outData[topRightIdx + 2]];
    const bottomLeftIdx = ((height - 1) * width) * 3;
    const bottomLeft = [outData[bottomLeftIdx], outData[bottomLeftIdx + 1], outData[bottomLeftIdx + 2]];
    const bottomRightIdx = ((height - 1) * width + (width - 1)) * 3;
    const bottomRight = [outData[bottomRightIdx], outData[bottomRightIdx + 1], outData[bottomRightIdx + 2]];

    expect(topLeft).toEqual([255, 255, 255]);
    expect(topRight).toEqual([255, 255, 255]);
    expect(bottomLeft).toEqual([255, 255, 255]);
    expect(bottomRight).toEqual([255, 255, 255]);

    // Verify foreground product center is preserved and vibrant
    const centerIdx = (100 * width + 150) * 3;
    const centerPixel = [outData[centerIdx], outData[centerIdx + 1], outData[centerIdx + 2]];
    // Center pixel should remain distinctly green (G > R and G > B)
    expect(centerPixel[1]).toBeGreaterThan(centerPixel[0]);
    expect(centerPixel[1]).toBeGreaterThan(centerPixel[2]);
  });

  it('preserves white and light-colored products (e.g. milk cartons, salt bags) without erasing them', async () => {
    const width = 200;
    const height = 200;
    // Grey counter background (150, 150, 150)
    const raw = Buffer.alloc(width * height * 3, 150);

    // White product in center (e.g., white milk bottle with blue brand logo)
    for (let y = 50; y < 150; y++) {
      for (let x = 50; x < 150; x++) {
        const idx = (y * width + x) * 3;
        if (y >= 85 && y <= 115 && x >= 85 && x <= 115) {
          // Blue brand logo on white packaging
          raw[idx] = 20;
          raw[idx + 1] = 80;
          raw[idx + 2] = 220;
        } else {
          // Pure white bottle body
          raw[idx] = 245;
          raw[idx + 1] = 245;
          raw[idx + 2] = 245;
        }
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outData } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

    // Corner must be pure white background #FFFFFF
    expect([outData[0], outData[1], outData[2]]).toEqual([255, 255, 255]);

    // White bottle body at (60, 60) must NOT be erased to background (must be preserved)
    const whiteBodyIdx = (60 * width + 60) * 3;
    expect(outData[whiteBodyIdx]).toBeGreaterThanOrEqual(240);

    // Blue logo at center (100, 100) must remain blue (B > R && B > G)
    const logoIdx = (100 * width + 100) * 3;
    expect(outData[logoIdx + 2]).toBeGreaterThan(outData[logoIdx]);
    expect(outData[logoIdx + 2]).toBeGreaterThan(outData[logoIdx + 1]);
  });

  it('preserves products that touch the image border without flooding through them', async () => {
    const width = 200;
    const height = 200;
    // Grey countertop (150, 150, 150)
    const raw = Buffer.alloc(width * height * 3, 150);

    // Red product touching top border (y from 0 to 90, x from 50 to 150)
    for (let y = 0; y < 90; y++) {
      for (let x = 50; x < 150; x++) {
        const idx = (y * width + x) * 3;
        raw[idx] = 200;
        raw[idx + 1] = 30;
        raw[idx + 2] = 30;
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outData } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

    // Top-left and top-right corners must be pure white background
    expect([outData[0], outData[1], outData[2]]).toEqual([255, 255, 255]);
    const trIdx = (width - 1) * 3;
    expect([outData[trIdx], outData[trIdx + 1], outData[trIdx + 2]]).toEqual([255, 255, 255]);

    // Product interior at (100, 45) must remain RED (not flooded with pure white background)
    const prodIdx = (45 * width + 100) * 3;
    expect(outData[prodIdx]).toBeGreaterThan(180);
    expect(outData[prodIdx + 1]).toBeLessThan(50);
    expect(outData[prodIdx + 2]).toBeLessThan(50);
  });

  it('preserves dark products while whitening table cast shadows', async () => {
    const width = 200;
    const height = 200;
    // Countertop (160, 160, 160)
    const raw = Buffer.alloc(width * height * 3, 160);

    // Dark product (e.g. black gadget or dark chocolate bar at 20, 20, 20)
    for (let y = 50; y < 140; y++) {
      for (let x = 50; x < 140; x++) {
        const idx = (y * width + x) * 3;
        raw[idx] = 20;
        raw[idx + 1] = 20;
        raw[idx + 2] = 20;
      }
    }

    // Cast shadow on the counter below product (y: 140..160, x: 45..145)
    for (let y = 140; y < 160; y++) {
      for (let x = 45; x < 145; x++) {
        const idx = (y * width + x) * 3;
        raw[idx] = 95;
        raw[idx + 1] = 95;
        raw[idx + 2] = 95;
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outData } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

    // Corners must be pure white background #FFFFFF
    expect([outData[0], outData[1], outData[2]]).toEqual([255, 255, 255]);

    // Dark product center at (95, 95) must remain DARK (< 40, not turned into white background)
    const darkProdIdx = (95 * width + 95) * 3;
    expect(outData[darkProdIdx]).toBeLessThan(40);
    expect(outData[darkProdIdx + 1]).toBeLessThan(40);
    expect(outData[darkProdIdx + 2]).toBeLessThan(40);
  });

  it('runs asynchronously and non-blockingly without delaying the HTTP response', async () => {
    const testProductId = `test_prod_${Date.now()}`;
    const testBuffer = await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 4,
        background: { r: 210, g: 210, b: 210, alpha: 1 }
      }
    }).png().toBuffer();

    let broadcastTriggered = false;
    const mockBroadcast = (payload: any) => {
      if (payload?.type === 'IMAGE_ENHANCED' && payload?.data?.productId === testProductId) {
        broadcastTriggered = true;
      }
    };

    const start = Date.now();
    const imageUrl = await processProductImageAsync({
      productId: testProductId,
      imageData: testBuffer,
      broadcast: mockBroadcast
    });
    const immediateElapsed = Date.now() - start;

    // Immediate return should be instantaneous (< 100ms)
    expect(immediateElapsed).toBeLessThan(200);
    expect(imageUrl).toBe(`/uploads/products/${testProductId}.webp`);

    // Verify initial file was written
    const expectedFilePath = path.join(TEST_UPLOADS_DIR, `${testProductId}.webp`);
    expect(fs.existsSync(expectedFilePath)).toBe(true);

    // Wait for the background worker queue to finish enhancement
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (broadcastTriggered) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      // Timeout after 3s
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 3000);
    });

    expect(broadcastTriggered).toBe(true);

    // Clean up test file
    try {
      if (fs.existsSync(expectedFilePath)) {
        fs.unlinkSync(expectedFilePath);
      }
    } catch {}
  });

  it('handles already-white background photos cleanly with high-key preserving product', async () => {
    const whiteBgBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).png().toBuffer();

    const output = await enhanceImageWithPureWhiteBg(whiteBgBuffer);
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);
  });

  it('verifies SQLite products table includes image_url column', () => {
    const tableInfo = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string; type: string }>;
    const imageUrlCol = tableInfo.find(col => col.name === 'image_url');
    expect(imageUrlCol).toBeDefined();
    expect(imageUrlCol?.name).toBe('image_url');
  });

  it('verifies public product catalog query selects image_url for customer website', () => {
    // Insert a test product with an image_url
    const testId = `test_pub_${Date.now()}`;
    const testSku = `SKU_${Date.now()}`;
    db.prepare(`
      INSERT INTO products (id, sku, name, price, gst_rate, uom, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testId, testSku, 'Test Product With Image', 199, 18, 'PCS', `/uploads/products/${testId}.webp`);

    const publicProduct = db.prepare(`
      SELECT id, sku, name, price, category, gst_rate, stock, low_stock_threshold, hsn_code, brand, uom, mrp, discount_percent, status, image_url
      FROM products
      WHERE id = ?
    `).get(testId) as any;

    expect(publicProduct).toBeDefined();
    expect(publicProduct.image_url).toBe(`/uploads/products/${testId}.webp`);

    // Clean up
    db.prepare('DELETE FROM products WHERE id = ?').run(testId);
  });

  it('handles transparent PNG images by converting transparent background to pure white while preserving dark products', async () => {
    // 100x100 transparent image with black circular product in center
    const svg = '<svg width="100" height="100"><circle cx="50" cy="50" r="30" fill="#111111"/></svg>';
    const inputBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outData, info: outInfo } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

    // Perimeter corners must be pure solid white #FFFFFF
    expect(outData[0]).toBe(255);
    expect(outData[1]).toBe(255);
    expect(outData[2]).toBe(255);

    // Center of black product must remain dark and preserved (< 40)
    const centerIdx = (50 * outInfo.width + 50) * outInfo.channels;
    expect(outData[centerIdx]).toBeLessThan(40);
    expect(outData[centerIdx + 1]).toBeLessThan(40);
    expect(outData[centerIdx + 2]).toBeLessThan(40);
  });

  it('handles invalid or empty image data gracefully', async () => {
    const emptyBuffer = Buffer.alloc(0);
    // enhanceImageWithPureWhiteBg should reject or throw handled error on empty buffer
    await expect(enhanceImageWithPureWhiteBg(emptyBuffer)).rejects.toThrow();
  });

  it('segments complex store photos with neural background removal and smooth edges', async () => {
    const width = 250;
    const height = 250;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const o = i * 3;
      const noise = (i % 23) * 3;
      raw[o] = 35 + noise;
      raw[o + 1] = 40 + noise;
      raw[o + 2] = 45 + noise;
    }

    // Cylindrical red can in the center
    for (let y = 30; y < 220; y++) {
      for (let x = 70; x < 180; x++) {
        const o = (y * width + x) * 3;
        raw[o] = 210;
        raw[o + 1] = 25;
        raw[o + 2] = 30;
      }
    }

    const inputBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
    const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
    const { data: outData } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

    // Perimeter corners must be pure white #FFFFFF
    expect(outData[0]).toBe(255);
    expect(outData[1]).toBe(255);
    expect(outData[2]).toBe(255);

    // Can center must remain vibrant red
    const centerIdx = (125 * width + 125) * 3;
    expect(outData[centerIdx]).toBeGreaterThan(180);
    expect(outData[centerIdx + 1]).toBeLessThan(60);
  });

  describe('Adaptive De-blurring & Clarity Recovery Pipeline', () => {
    it('evaluates sharpness and contrast metrics accurately, distinguishing sharp vs blurry vs low-contrast images', async () => {
      // 1. Generate sharp barcode-like pattern
      const width = 120;
      const height = 120;
      const sharpRaw = Buffer.alloc(width * height * 3, 230);
      for (let x = 10; x < 110; x += 4) {
        for (let y = 10; y < 110; y++) {
          const idx = (y * width + x) * 3;
          sharpRaw[idx] = 10;
          sharpRaw[idx + 1] = 10;
          sharpRaw[idx + 2] = 10;
        }
      }
      const sharpBuffer = await sharp(sharpRaw, { raw: { width, height, channels: 3 } }).png().toBuffer();
      const sharpMetrics = await evaluateImageClarity(sharpBuffer);

      expect(sharpMetrics.sharpness).toBeGreaterThan(5.0);
      expect(sharpMetrics.isBlurry).toBe(false);
      expect(sharpMetrics.recommendedSigma).toBeLessThanOrEqual(1.05);

      // 2. Generate blurred version
      const blurryBuffer = await sharp(sharpBuffer).blur(2.5).png().toBuffer();
      const blurryMetrics = await evaluateImageClarity(blurryBuffer);

      expect(blurryMetrics.sharpness).toBeLessThan(sharpMetrics.sharpness);
      expect(blurryMetrics.isBlurry).toBe(true);
      expect(blurryMetrics.recommendedSigma).toBeGreaterThanOrEqual(1.4);

      // 3. Generate low contrast washed-out image
      const lowContrastRaw = Buffer.alloc(width * height * 3);
      for (let i = 0; i < width * height * 3; i++) {
        lowContrastRaw[i] = 128 + (i % 7); // tiny variance
      }
      const lowContrastBuffer = await sharp(lowContrastRaw, { raw: { width, height, channels: 3 } }).png().toBuffer();
      const lowContrastMetrics = await evaluateImageClarity(lowContrastBuffer);

      expect(lowContrastMetrics.isLowContrast).toBe(true);
      expect(lowContrastMetrics.claheRequired).toBe(true);
    });

    it('applyAdaptiveDeblurAndClarity restores sharpness and edge definition on blurry product labels', async () => {
      const width = 100;
      const height = 100;
      const raw = Buffer.alloc(width * height * 3, 210);
      for (let x = 20; x < 80; x += 4) {
        for (let y = 20; y < 80; y++) {
          const idx = (y * width + x) * 3;
          raw[idx] = 20;
          raw[idx + 1] = 20;
          raw[idx + 2] = 20;
        }
      }
      const original = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
      const blurry = await sharp(original).blur(2.2).png().toBuffer();
      const beforeStats = await evaluateImageClarity(blurry);

      const recovered = await applyAdaptiveDeblurAndClarity(blurry, beforeStats);
      const afterStats = await evaluateImageClarity(recovered);

      // Sharpness should be substantially improved by the de-blurring filter
      expect(afterStats.sharpness).toBeGreaterThan(beforeStats.sharpness);
    });

    it('enhances blurry product photos with pure white background and de-blurred foreground', async () => {
      const width = 140;
      const height = 140;
      const raw = Buffer.alloc(width * height * 3, 170); // grey table

      // Blue product in center (30..110)
      for (let y = 30; y < 110; y++) {
        for (let x = 30; x < 110; x++) {
          const idx = (y * width + x) * 3;
          raw[idx] = 30;
          raw[idx + 1] = 90;
          raw[idx + 2] = 220;
        }
      }

      const inputSharp = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
      // Apply blur to simulate camera shake or soft focus
      const blurryInput = await sharp(inputSharp).blur(1.8).png().toBuffer();

      const outputBuffer = await enhanceImageWithPureWhiteBg(blurryInput);
      const { data: outData, info: outInfo } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

      // Corners must be pure white #FFFFFF
      expect(outData[0]).toBe(255);
      expect(outData[1]).toBe(255);
      expect(outData[2]).toBe(255);

      const trIdx = (outInfo.width - 1) * 3;
      expect(outData[trIdx]).toBe(255);
      expect(outData[trIdx + 1]).toBe(255);
      expect(outData[trIdx + 2]).toBe(255);

      // Center product detail must remain distinctly blue and vibrant (not washed out to white)
      const centerOffset = (70 * outInfo.width + 70) * 3;
      expect(outData[centerOffset + 2]).toBeGreaterThan(outData[centerOffset]);
      expect(outData[centerOffset + 2]).toBeGreaterThan(outData[centerOffset + 1]);
      expect(outData[centerOffset + 2]).toBeGreaterThan(150);
    });

    it('evaluates clarity on single-channel grayscale images without error', async () => {
      const width = 80;
      const height = 80;
      const raw = Buffer.alloc(width * height, 180);
      // Draw dark barcode stripe
      for (let y = 10; y < 70; y++) {
        for (let x = 20; x < 40; x++) {
          raw[y * width + x] = 20;
        }
      }
      const grayBuffer = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
      const metrics = await evaluateImageClarity(grayBuffer);

      expect(metrics).toBeDefined();
      expect(typeof metrics.sharpness).toBe('number');
      expect(metrics.contrast).toBeGreaterThan(0);
      expect(typeof metrics.claheRequired).toBe('boolean');
    });

    it('pre-downscales high-resolution images to max 1024px while maintaining #FFFFFF background', async () => {
      // 1200x1200 image
      const width = 1200;
      const height = 1200;
      const raw = Buffer.alloc(width * height * 3, 190); // grey table
      // Red product in center
      for (let y = 300; y < 900; y++) {
        for (let x = 300; x < 900; x++) {
          const idx = (y * width + x) * 3;
          raw[idx] = 220;
          raw[idx + 1] = 40;
          raw[idx + 2] = 40;
        }
      }
      const inputBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
      const outputBuffer = await enhanceImageWithPureWhiteBg(inputBuffer);
      const { info, data: outData } = await sharp(outputBuffer).raw().toBuffer({ resolveWithObject: true });

      expect(info.width).toBeLessThanOrEqual(1024);
      expect(info.height).toBeLessThanOrEqual(1024);
      expect(outData[0]).toBe(255);
      expect(outData[1]).toBe(255);
      expect(outData[2]).toBe(255);
    });
  });
});
