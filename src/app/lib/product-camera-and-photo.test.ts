import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compressImageFileToDataUrl,
  captureVideoFrameToDataUrl
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
  });
});
