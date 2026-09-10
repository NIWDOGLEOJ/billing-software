import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  hasLiveCameraSupport,
  createConfiguredZxingReader,
  decodeBarcodeFromFile,
  SUPPORTED_BARCODE_FORMATS,
  ZXING_BARCODE_FORMATS,
} from '../utils/barcodeDecoder';
import { ProductPhotoCaptureModal } from '../components/product-photo-capture-modal';

describe('Mobile Camera & Insecure Context Resilience', () => {
  const originalNavigator = global.navigator;
  const originalWindow = global.window;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasLiveCameraSupport environment detection', () => {
    it('returns false when window.isSecureContext is false (LAN HTTP on mobile)', () => {
      // Emulate insecure HTTP LAN context on mobile browser
      const mockWindow = { isSecureContext: false } as any;
      const mockNav = {
        mediaDevices: {
          getUserMedia: vi.fn(),
        },
      } as any;

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('navigator', mockNav);

      expect(hasLiveCameraSupport()).toBe(false);
    });

    it('returns false when navigator.mediaDevices is undefined (insecure browser context)', () => {
      const mockWindow = { isSecureContext: false } as any;
      const mockNav = {} as any; // mediaDevices stripped by Safari/Chrome on HTTP

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('navigator', mockNav);

      expect(hasLiveCameraSupport()).toBe(false);
    });

    it('returns true when window.isSecureContext is true and getUserMedia is a function (HTTPS / localhost)', () => {
      const mockWindow = { isSecureContext: true } as any;
      const mockNav = {
        mediaDevices: {
          getUserMedia: vi.fn(),
        },
      } as any;

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('navigator', mockNav);

      expect(hasLiveCameraSupport()).toBe(true);
    });
  });

  describe('Barcode Decoder & Symbology Support', () => {
    it('initializes ZXing reader with TRY_HARDER and comprehensive 1D/2D formats', () => {
      const reader = createConfiguredZxingReader();
      expect(reader).toBeDefined();

      // Ensure key retail barcode formats are included
      expect(SUPPORTED_BARCODE_FORMATS).toContain('ean_13');
      expect(SUPPORTED_BARCODE_FORMATS).toContain('code_128');
      expect(SUPPORTED_BARCODE_FORMATS).toContain('upc_a');
      expect(SUPPORTED_BARCODE_FORMATS).toContain('qr_code');

      expect(ZXING_BARCODE_FORMATS.length).toBeGreaterThanOrEqual(10);
    });

    it('returns null gracefully when decoding null or empty file without throwing', async () => {
      const result = await decodeBarcodeFromFile(null as any);
      expect(result).toBeNull();
    });
  });

  describe('ProductPhotoCaptureModal Mobile Fallback Markup', () => {
    it('renders with mobile camera capture input having capture="environment"', () => {
      const html = renderToString(
        React.createElement(ProductPhotoCaptureModal, {
          isOpen: true,
          onClose: () => {},
          onCapture: () => {},
          title: 'Take Product Photo',
        })
      );

      // Verify presence of environment camera capture input
      expect(html).toContain('capture="environment"');
      expect(html).toContain('accept="image/*"');
      expect(html).toContain('Take Product Photo');
    });

    it('displays prompt to open device camera or choose from gallery', () => {
      const html = renderToString(
        React.createElement(ProductPhotoCaptureModal, {
          isOpen: true,
          onClose: () => {},
          onCapture: () => {},
        })
      );

      expect(html).toContain('Gallery');
      expect(html).toContain('Snap Photo');
    });
  });

  describe('Cashier Register Re-exports Compatibility', () => {
    it('CashierBillingAdvanced exports all barcode and camera utilities for backward compatibility', async () => {
      const cashierModule = await import('../components/cashier-billing-advanced');
      
      expect(cashierModule.SUPPORTED_BARCODE_FORMATS).toBeDefined();
      expect(cashierModule.ZXING_BARCODE_FORMATS).toBeDefined();
      expect(typeof cashierModule.createConfiguredZxingReader).toBe('function');
      expect(typeof cashierModule.hasLiveCameraSupport).toBe('function');
      expect(typeof cashierModule.decodeBarcodeFromFile).toBe('function');
      expect(typeof cashierModule.startLiveBarcodeScanner).toBe('function');
      expect(typeof cashierModule.requestLiveCameraStream).toBe('function');
      expect(typeof cashierModule.hasTorchSupport).toBe('function');
      expect(typeof cashierModule.toggleCameraTorch).toBe('function');
    });
  });
});
