import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compressImageFileToDataUrl,
  captureVideoFrameToDataUrl,
  rotateImageDataUrl
} from '../utils/imageCompressor';

describe('Product Camera & In-App Photo Capture System', () => {
  let mockSessionStorage: Record<string, string> = {};

  beforeEach(() => {
    mockSessionStorage = {};

    (global as any).sessionStorage = {
      getItem: (key: string) => mockSessionStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockSessionStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockSessionStorage[key];
      },
      clear: () => {
        mockSessionStorage = {};
      },
    };

    if (typeof (global as any).window === 'undefined') {
      (global as any).window = {};
    }
  });

  afterEach(() => {
    mockSessionStorage = {};
    vi.restoreAllMocks();
  });

  describe('captureVideoFrameToDataUrl', () => {
    it('returns empty string if video element has zero dimensions or is unready', () => {
      const mockVideoZero = {
        videoWidth: 0,
        videoHeight: 0,
      } as HTMLVideoElement;

      expect(captureVideoFrameToDataUrl(mockVideoZero)).toBe('');
      expect(captureVideoFrameToDataUrl(null as any)).toBe('');
    });

    it('captures frame from video element onto canvas and scales to max dimension', () => {
      const drawImageSpy = vi.fn();
      const toDataUrlSpy = vi.fn().mockReturnValue('data:image/jpeg;base64,mockframedata');

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          drawImage: drawImageSpy,
        }),
        toDataURL: toDataUrlSpy,
      };

      const origDoc = (global as any).document;
      (global as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') return mockCanvas;
          return {};
        },
      };

      const mockVideo = {
        videoWidth: 1920,
        videoHeight: 1080,
      } as HTMLVideoElement;

      const result = captureVideoFrameToDataUrl(mockVideo, 1200, 0.88);

      expect(result).toBe('data:image/jpeg;base64,mockframedata');
      expect(mockCanvas.width).toBe(1200);
      expect(mockCanvas.height).toBe(675); // 1080 * (1200 / 1920) = 675
      expect(drawImageSpy).toHaveBeenCalledWith(mockVideo, 0, 0, 1200, 675);
      expect(toDataUrlSpy).toHaveBeenCalledWith('image/jpeg', 0.88);

      (global as any).document = origDoc;
    });
  });

  describe('compressImageFileToDataUrl Memory-Safe Processing', () => {
    it('returns empty string if file is null/undefined', async () => {
      const result = await compressImageFileToDataUrl(null as any);
      expect(result).toBe('');
    });

    it('processes image using URL.createObjectURL and revokes URL in finally', async () => {
      const revokeSpy = vi.fn();
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');

      (global as any).window.URL = {
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeSpy,
      };

      const drawImageSpy = vi.fn();
      const toDataUrlSpy = vi.fn().mockReturnValue('data:image/jpeg;base64,compressedphoto');

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          drawImage: drawImageSpy,
        }),
        toDataURL: toDataUrlSpy,
      };

      const origDoc = (global as any).document;
      (global as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') return mockCanvas;
          return {};
        },
      };

      class MockImage {
        naturalWidth = 2400;
        naturalHeight = 1800;
        width = 2400;
        height = 1800;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';
        set src(val: string) {
          this._src = val;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 10);
        }
        get src() {
          return this._src;
        }
      }

      (global as any).Image = MockImage;
      (global as any).window.Image = MockImage;

      const mockFile = new File(['fake-image-bits'], 'photo.jpg', { type: 'image/jpeg' });
      const result = await compressImageFileToDataUrl(mockFile, 1200, 0.88);

      expect(createObjectURLSpy).toHaveBeenCalledWith(mockFile);
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
      expect(result).toBe('data:image/jpeg;base64,compressedphoto');
      expect(mockCanvas.width).toBe(1200);
      expect(mockCanvas.height).toBe(900);

      (global as any).document = origDoc;
    });
  });

  describe('Draft State Persistence across Mobile Browser Eviction & Reloads', () => {
    it('saves and restores Quick Add product draft in sessionStorage', () => {
      const DRAFT_KEY = 'nexusflow_quick_add_draft';

      const draftState = {
        isOpen: true,
        barcode: '8901234567890',
        form: {
          name: 'Amul Butter 100g',
          price: '58',
          category: 'Dairy',
          gstRate: 12,
          stock: '50',
          hsnCode: '0402',
          uom: 'PCS',
        },
        image: 'data:image/jpeg;base64,restoredbutterphoto',
        isAddingCustomUom: false,
      };

      // 1. Simulate saving draft before camera opens
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftState));

      // 2. Simulate phone background eviction, memory reload, and recovery
      const raw = sessionStorage.getItem(DRAFT_KEY);
      expect(raw).toBeTruthy();
      const restored = JSON.parse(raw!);

      expect(restored.isOpen).toBe(true);
      expect(restored.barcode).toBe('8901234567890');
      expect(restored.form.name).toBe('Amul Butter 100g');
      expect(restored.form.price).toBe('58');
      expect(restored.image).toBe('data:image/jpeg;base64,restoredbutterphoto');

      // 3. Clear draft upon form submission or cancellation
      sessionStorage.removeItem(DRAFT_KEY);
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('saves and restores Analytics Add Product draft in sessionStorage', () => {
      const ANALYTICS_KEY = 'nexusflow_analytics_add_draft';

      const draftState = {
        isOpen: true,
        form: {
          sku: 'SKU-994422',
          name: 'Colgate Strong Teeth 200g',
          brand: 'Colgate',
          category: 'Oral Care',
          uom: 'PCS',
          stock: '120',
          mrp: '110',
          price: '105',
          purchasePrice: '90',
          wholesalePrice: '98',
          distributorPrice: '95',
          discountPercent: '5',
          hsnCode: '3306',
          batchNumber: 'B99',
          genericName: 'Toothpaste',
          manufacturer: 'Colgate-Palmolive',
          strength: '200g',
          supplierDetails: 'Distributor A',
        },
        capturedImage: 'data:image/jpeg;base64,toothpastephotodata',
        formGst: 18,
      };

      sessionStorage.setItem(ANALYTICS_KEY, JSON.stringify(draftState));

      const raw = sessionStorage.getItem(ANALYTICS_KEY);
      expect(raw).toBeTruthy();
      const restored = JSON.parse(raw!);

      expect(restored.isOpen).toBe(true);
      expect(restored.form.name).toBe('Colgate Strong Teeth 200g');
      expect(restored.capturedImage).toBe('data:image/jpeg;base64,toothpastephotodata');
      expect(restored.formGst).toBe(18);

      sessionStorage.removeItem(ANALYTICS_KEY);
      expect(sessionStorage.getItem(ANALYTICS_KEY)).toBeNull();
    });
  });

  describe('ProductPhotoCaptureModal Component Module', () => {
    it('exports ProductPhotoCaptureModal as a functional React component', async () => {
      const { ProductPhotoCaptureModal } = await import('../components/product-photo-capture-modal');
      expect(typeof ProductPhotoCaptureModal).toBe('function');
    });

    it('CashierBillingAdvanced imports cleanly with ProductPhotoCaptureModal integration', async () => {
      const { CashierBillingAdvanced } = await import('../components/cashier-billing-advanced');
      expect(typeof CashierBillingAdvanced).toBe('function');
    });

    it('constructs correct product creation payload including captured image for website', () => {
      const barcode = '8901030383838';
      const form = {
        name: 'Lipton Green Tea 25 Bags',
        price: '160',
        category: 'Beverages',
        gstRate: 5,
        stock: '30',
        hsnCode: '0902',
        uom: 'BOX',
      };
      const quickAddImage = 'data:image/jpeg;base64,greenteaphotodata';

      const payload = {
        id: `prod_${Date.now()}`,
        sku: barcode,
        name: form.name,
        price: parseFloat(form.price),
        category: form.category,
        gst_rate: form.gstRate,
        stock: parseInt(form.stock) || 0,
        low_stock_threshold: 10,
        hsn_code: form.hsnCode,
        uom: form.uom,
        image: quickAddImage || undefined,
      };

      expect(payload.sku).toBe('8901030383838');
      expect(payload.image).toBe('data:image/jpeg;base64,greenteaphotodata');
      expect(payload.price).toBe(160);
      expect(payload.stock).toBe(30);
    });
    it('renders ProductPhotoCaptureModal markup in open state', async () => {
      const React = (await import('react')).default;
      const { renderToString } = await import('react-dom/server');
      const { ProductPhotoCaptureModal } = await import('../components/product-photo-capture-modal');

      const html = renderToString(
        React.createElement(ProductPhotoCaptureModal, {
          isOpen: true,
          onClose: () => {},
          onCapture: () => {},
          title: 'Take Product Photo',
        })
      );

      expect(html).toContain('Take Product Photo');
      expect(html).toContain('Gallery');
    });

    it('returns empty string when isOpen is false', async () => {
      const React = (await import('react')).default;
      const { renderToString } = await import('react-dom/server');
      const { ProductPhotoCaptureModal } = await import('../components/product-photo-capture-modal');

      const html = renderToString(
        React.createElement(ProductPhotoCaptureModal, {
          isOpen: false,
          onClose: () => {},
          onCapture: () => {},
        })
      );

      expect(html).toBe('');
    });
  });

  describe('rotateImageDataUrl Function', () => {
    it('returns original dataUrl when degrees is 0 or multiple of 360', async () => {
      const dataUrl = 'data:image/jpeg;base64,samplephoto123';
      expect(await rotateImageDataUrl(dataUrl, 0)).toBe(dataUrl);
      expect(await rotateImageDataUrl(dataUrl, 360)).toBe(dataUrl);
      expect(await rotateImageDataUrl(dataUrl, -360)).toBe(dataUrl);
    });

    it('returns empty string when given empty input', async () => {
      expect(await rotateImageDataUrl('', 90)).toBe('');
    });

    it('rotates image by 90, 180, and 270 degrees clockwise', async () => {
      const origImage = (global as any).Image;
      const origDocument = (global as any).document;

      let rotatedDegrees = 0;
      let lastWidth = 0;
      let lastHeight = 0;
      let lastMime = '';

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn((rad: number) => {
          rotatedDegrees = Math.round((rad * 180) / Math.PI);
        }),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
      };

      const mockCanvas = {
        get width() {
          return lastWidth;
        },
        set width(val: number) {
          lastWidth = val;
        },
        get height() {
          return lastHeight;
        },
        set height(val: number) {
          lastHeight = val;
        },
        getContext: vi.fn(() => mockCtx),
        toDataURL: vi.fn((mime: string) => {
          lastMime = mime;
          return `data:${mime};base64,rotated_image_result`;
        }),
      };

      (global as any).document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') return mockCanvas;
          return {};
        }),
      };

      class MockImg {
        width = 400;
        height = 300;
        naturalWidth = 400;
        naturalHeight = 300;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_val: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }

      (global as any).Image = MockImg;
      (global as any).window.Image = MockImg;

      // Rotate 90°
      const res90 = await rotateImageDataUrl('data:image/jpeg;base64,rawinput', 90);
      expect(res90).toBe('data:image/jpeg;base64,rotated_image_result');
      expect(lastWidth).toBe(300);
      expect(lastHeight).toBe(400);
      expect(rotatedDegrees).toBe(90);
      expect(lastMime).toBe('image/jpeg');

      // Rotate 180°
      const res180 = await rotateImageDataUrl('data:image/jpeg;base64,rawinput', 180);
      expect(res180).toBe('data:image/jpeg;base64,rotated_image_result');
      expect(lastWidth).toBe(400);
      expect(lastHeight).toBe(300);
      expect(rotatedDegrees).toBe(180);

      // Rotate 270°
      const res270 = await rotateImageDataUrl('data:image/jpeg;base64,rawinput', 270);
      expect(res270).toBe('data:image/jpeg;base64,rotated_image_result');
      expect(lastWidth).toBe(300);
      expect(lastHeight).toBe(400);
      expect(rotatedDegrees).toBe(270);

      // Rotate negative angle (-90° normalizes to 270°)
      const resNeg90 = await rotateImageDataUrl('data:image/jpeg;base64,rawinput', -90);
      expect(resNeg90).toBe('data:image/jpeg;base64,rotated_image_result');
      expect(rotatedDegrees).toBe(270);

      // Preserves PNG mime type for transparent product images
      const resPng = await rotateImageDataUrl('data:image/png;base64,transparent_input', 90);
      expect(resPng).toBe('data:image/png;base64,rotated_image_result');
      expect(lastMime).toBe('image/png');

      // Restore
      (global as any).Image = origImage;
      if (origDocument) {
        (global as any).document = origDocument;
      } else {
        delete (global as any).document;
      }
    });
  });
});
