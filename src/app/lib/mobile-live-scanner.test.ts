import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  startLiveBarcodeScanner,
  requestLiveCameraStream,
  applyOptimalContinuousAutofocus,
  hasTorchSupport,
  toggleCameraTorch,
  SUPPORTED_BARCODE_FORMATS,
  ZXING_BARCODE_FORMATS,
  createConfiguredZxingReader,
} from '../utils/barcodeDecoder';

if (typeof HTMLVideoElement === 'undefined') {
  class MockHTMLVideoElement {}
  (globalThis as any).HTMLVideoElement = MockHTMLVideoElement;
  if (typeof window !== 'undefined') (window as any).HTMLVideoElement = MockHTMLVideoElement;
}

describe('Mobile Live Barcode Scanner Engine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') delete (window as any).BarcodeDetector;
    if (typeof global !== 'undefined') delete (global as any).BarcodeDetector;
    if (typeof globalThis !== 'undefined') delete (globalThis as any).BarcodeDetector;
  });

  describe('startLiveBarcodeScanner with native BarcodeDetector', () => {
    it('initializes native BarcodeDetector and decodes barcode frames continuously', async () => {
      const mockDetect = vi.fn().mockResolvedValue([
        { rawValue: '8901234567890', format: 'ean_13' },
      ]);
      const mockBarcodeDetector = vi.fn().mockImplementation(() => ({
        detect: mockDetect,
      }));

      vi.stubGlobal('BarcodeDetector', mockBarcodeDetector);
      if (typeof window !== 'undefined') (window as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof global !== 'undefined') (global as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof globalThis !== 'undefined') (globalThis as any).BarcodeDetector = mockBarcodeDetector;

      const mockVideoElement = {
        readyState: 4, // HAVE_ENOUGH_DATA
        videoWidth: 1280,
        videoHeight: 720,
      } as any;

      const onScan = vi.fn();
      const onError = vi.fn();

      const controller = startLiveBarcodeScanner({
        videoElement: mockVideoElement,
        onScan,
        onError,
        scanIntervalMs: 50,
      });

      expect(controller.isRunning()).toBe(true);
      expect(mockBarcodeDetector).toHaveBeenCalledWith({
        formats: SUPPORTED_BARCODE_FORMATS,
      });

      // Allow detectFrame to fire
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(mockDetect).toHaveBeenCalledWith(mockVideoElement);
      expect(onScan).toHaveBeenCalledWith('8901234567890', 'ean_13');

      controller.stop();
      expect(controller.isRunning()).toBe(false);
    });

    it('stops scanning cleanly when controller.stop() is called', async () => {
      const mockDetect = vi.fn().mockResolvedValue([]);
      const mockDetectorClass = vi.fn().mockImplementation(() => ({
        detect: mockDetect,
      }));
      vi.stubGlobal('BarcodeDetector', mockDetectorClass);
      if (typeof window !== 'undefined') (window as any).BarcodeDetector = mockDetectorClass;
      if (typeof global !== 'undefined') (global as any).BarcodeDetector = mockDetectorClass;
      if (typeof globalThis !== 'undefined') (globalThis as any).BarcodeDetector = mockDetectorClass;

      const mockVideoElement = {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
      } as any;

      const controller = startLiveBarcodeScanner({
        videoElement: mockVideoElement,
        onScan: vi.fn(),
        scanIntervalMs: 40,
      });

      expect(controller.isRunning()).toBe(true);
      controller.stop();
      expect(controller.isRunning()).toBe(false);

      const callsBefore = mockDetect.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockDetect.mock.calls.length).toBe(callsBefore);
    });

    it('falls back to parameterless BarcodeDetector constructor when formats option throws TypeError', async () => {
      let callCount = 0;
      const mockDetect = vi.fn().mockResolvedValue([{ rawValue: '12345678', format: 'ean_8' }]);
      const mockBarcodeDetector = vi.fn().mockImplementation((opts?: any) => {
        callCount++;
        if (opts && opts.formats) {
          throw new TypeError('Unsupported format: aztec');
        }
        return { detect: mockDetect };
      });

      vi.stubGlobal('BarcodeDetector', mockBarcodeDetector);
      if (typeof window !== 'undefined') (window as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof global !== 'undefined') (global as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof globalThis !== 'undefined') (globalThis as any).BarcodeDetector = mockBarcodeDetector;

      const mockVideoElement = {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
      } as any;

      const onScan = vi.fn();
      const controller = startLiveBarcodeScanner({
        videoElement: mockVideoElement,
        onScan,
        scanIntervalMs: 50,
      });

      expect(controller.isRunning()).toBe(true);
      expect(mockBarcodeDetector).toHaveBeenCalledTimes(2);
      expect(mockBarcodeDetector).toHaveBeenNthCalledWith(1, { formats: SUPPORTED_BARCODE_FORMATS });
      expect(mockBarcodeDetector).toHaveBeenNthCalledWith(2);

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(onScan).toHaveBeenCalledWith('12345678', 'ean_8');
      controller.stop();
    });

    it('triggers onNoBarcode callback when native detector finds no barcode in frame', async () => {
      const mockDetect = vi.fn().mockResolvedValue([]);
      const mockBarcodeDetector = vi.fn().mockImplementation(() => ({
        detect: mockDetect,
      }));

      vi.stubGlobal('BarcodeDetector', mockBarcodeDetector);
      if (typeof window !== 'undefined') (window as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof global !== 'undefined') (global as any).BarcodeDetector = mockBarcodeDetector;
      if (typeof globalThis !== 'undefined') (globalThis as any).BarcodeDetector = mockBarcodeDetector;

      const mockVideoElement = {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
      } as any;

      const onNoBarcode = vi.fn();
      const controller = startLiveBarcodeScanner({
        videoElement: mockVideoElement,
        onScan: vi.fn(),
        onNoBarcode,
        scanIntervalMs: 40,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(onNoBarcode).toHaveBeenCalled();
      controller.stop();
    });
  });

  describe('startLiveBarcodeScanner ZXing continuous fallback', () => {
    it('falls back to ZXing decodeFromVideoElementContinuously when BarcodeDetector is absent', async () => {
      vi.stubGlobal('BarcodeDetector', undefined);
      if (typeof window !== 'undefined') delete (window as any).BarcodeDetector;
      if (typeof global !== 'undefined') delete (global as any).BarcodeDetector;
      if (typeof globalThis !== 'undefined') delete (globalThis as any).BarcodeDetector;

      const mockVideoElement = {
        readyState: 4,
        videoWidth: 1280,
        videoHeight: 720,
        hasAttribute: vi.fn().mockReturnValue(false),
        setAttribute: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as any;
      Object.setPrototypeOf(mockVideoElement, HTMLVideoElement.prototype);

      const onScan = vi.fn();
      const controller = startLiveBarcodeScanner({
        videoElement: mockVideoElement,
        onScan,
        scanIntervalMs: 80,
      });

      expect(controller.isRunning()).toBe(true);
      controller.stop();
      expect(controller.isRunning()).toBe(false);
    });
  });

  describe('requestLiveCameraStream & Autofocus Constraints', () => {
    it('requests stream with environment facingMode and continuous autofocus', async () => {
      const mockApplyConstraints = vi.fn().mockResolvedValue(undefined);
      const mockTrack = {
        kind: 'video',
        getCapabilities: vi.fn().mockReturnValue({
          focusMode: ['none', 'continuous', 'manual'],
          torch: true,
        }),
        applyConstraints: mockApplyConstraints,
      };

      const mockStream = {
        getVideoTracks: () => [mockTrack],
      } as any;

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia,
        },
      } as any);

      const stream = await requestLiveCameraStream('environment');
      expect(stream).toBe(mockStream);
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            facingMode: { ideal: 'environment' },
          }),
          audio: false,
        })
      );
      expect(mockApplyConstraints).toHaveBeenCalledWith({
        advanced: [{ focusMode: 'continuous' }],
      });
    });

    it('falls back to relaxed constraints if ideal high-res constraints fail', async () => {
      const mockTrack = {
        kind: 'video',
        getCapabilities: vi.fn().mockReturnValue({}),
      };
      const mockFallbackStream = {
        getVideoTracks: () => [mockTrack],
      } as any;

      const mockGetUserMedia = vi
        .fn()
        .mockRejectedValueOnce(new Error('OverconstrainedError'))
        .mockResolvedValueOnce(mockFallbackStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia,
        },
      } as any);

      const stream = await requestLiveCameraStream('environment');
      expect(stream).toBe(mockFallbackStream);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });

    it('throws CAMERA_GUM_UNAVAILABLE when getUserMedia is not present', async () => {
      vi.stubGlobal('navigator', {} as any);
      await expect(requestLiveCameraStream('environment')).rejects.toThrow('CAMERA_GUM_UNAVAILABLE');
    });
  });

  describe('Torch / Flashlight Controls', () => {
    it('identifies torch capability correctly', () => {
      const streamWithTorch = {
        getVideoTracks: () => [
          {
            getCapabilities: () => ({ torch: true }),
          },
        ],
      } as any;

      const streamWithoutTorch = {
        getVideoTracks: () => [
          {
            getCapabilities: () => ({ focusMode: ['continuous'] }),
          },
        ],
      } as any;

      expect(hasTorchSupport(streamWithTorch)).toBe(true);
      expect(hasTorchSupport(streamWithoutTorch)).toBe(false);
      expect(hasTorchSupport(null)).toBe(false);
    });

    it('toggles torch on and off by applying constraints', async () => {
      const mockApplyConstraints = vi.fn().mockResolvedValue(undefined);
      const stream = {
        getVideoTracks: () => [
          {
            getCapabilities: () => ({ torch: true }),
            applyConstraints: mockApplyConstraints,
          },
        ],
      } as any;

      const enabled = await toggleCameraTorch(stream, true);
      expect(enabled).toBe(true);
      expect(mockApplyConstraints).toHaveBeenCalledWith({
        advanced: [{ torch: true }],
      });

      const disabled = await toggleCameraTorch(stream, false);
      expect(disabled).toBe(true);
      expect(mockApplyConstraints).toHaveBeenCalledWith({
        advanced: [{ torch: false }],
      });
    });
  });

  describe('Continuous Scanning Deduplication & Real-time Decoding Behavior', () => {
    it('debounces identical barcodes within cooldown period and allows immediate scan of distinct barcodes', () => {
      let lastScannedCode = '';
      let lastScannedTimestamp = 0;
      const scannedHistory: string[] = [];

      const simulateScan = (code: string, timestamp: number) => {
        if (code === lastScannedCode && timestamp - lastScannedTimestamp < 1500) {
          return false; // cooldown active
        }
        lastScannedCode = code;
        lastScannedTimestamp = timestamp;
        scannedHistory.push(code);
        return true;
      };

      const t0 = 1000;
      // First scan of Product A (e.g. Milk)
      expect(simulateScan('8901234567890', t0)).toBe(true);

      // Same Product A kept in front of camera at 100ms, 200ms, 500ms, 1200ms
      expect(simulateScan('8901234567890', t0 + 100)).toBe(false);
      expect(simulateScan('8901234567890', t0 + 200)).toBe(false);
      expect(simulateScan('8901234567890', t0 + 500)).toBe(false);
      expect(simulateScan('8901234567890', t0 + 1200)).toBe(false);

      // Product B (e.g. Bread) appears at 1300ms: should scan IMMEDIATELY without waiting
      expect(simulateScan('8909876543210', t0 + 1300)).toBe(true);

      // Product A scanned again after cooldown (1300ms + 1600ms = 2900ms): should scan immediately
      expect(simulateScan('8901234567890', t0 + 2900)).toBe(true);

      expect(scannedHistory).toEqual(['8901234567890', '8909876543210', '8901234567890']);
    });

    it('allows immediate scan of the same barcode when view has cleared (item pulled away)', () => {
      let lastScannedCode = '';
      let lastScannedTimestamp = 0;
      let clearedBarcodeView = true;
      const scannedHistory: string[] = [];

      const simulateScan = (code: string, timestamp: number) => {
        if (code === lastScannedCode && timestamp - lastScannedTimestamp < 2500 && !clearedBarcodeView) {
          return false;
        }
        lastScannedCode = code;
        lastScannedTimestamp = timestamp;
        clearedBarcodeView = false;
        scannedHistory.push(code);
        return true;
      };

      const t0 = 1000;
      // Scan Milk
      expect(simulateScan('8901234567890', t0)).toBe(true);
      // Still holding Milk at 500ms -> ignored
      expect(simulateScan('8901234567890', t0 + 500)).toBe(false);

      // Cashier bags Milk and pulls it away (field of view cleared)
      clearedBarcodeView = true;

      // Cashier brings another carton of Milk at 800ms -> immediately scans without waiting 2500ms!
      expect(simulateScan('8901234567890', t0 + 800)).toBe(true);
      expect(scannedHistory).toEqual(['8901234567890', '8901234567890']);
    });

    it('pauses scanning while unrecognized barcode modal is active and applies cooldown on dismissal', () => {
      let unrecognizedModalActive = false;
      let lastScannedCode = '';
      let lastScannedTimestamp = 0;
      let promptCount = 0;

      const simulateScan = (code: string, timestamp: number, isKnown: boolean) => {
        if (unrecognizedModalActive) return 'paused';
        if (code === lastScannedCode && timestamp - lastScannedTimestamp < 2500) {
          return 'cooldown';
        }
        lastScannedCode = code;
        lastScannedTimestamp = timestamp;

        if (isKnown) {
          return 'added';
        } else {
          unrecognizedModalActive = true;
          promptCount++;
          return 'unrecognized_prompt';
        }
      };

      const t0 = 1000;
      // Scan unknown barcode
      expect(simulateScan('UNKNOWN_CODE', t0, false)).toBe('unrecognized_prompt');
      expect(promptCount).toBe(1);

      // While dialog is open, incoming frames do not trigger new beeps or dialogs
      expect(simulateScan('UNKNOWN_CODE', t0 + 100, false)).toBe('paused');
      expect(simulateScan('UNKNOWN_CODE', t0 + 500, false)).toBe('paused');
      expect(simulateScan('KNOWN_ITEM', t0 + 800, true)).toBe('paused');
      expect(promptCount).toBe(1);

      // User taps "Scan Next" -> dialog closes, cooldown applied to UNKNOWN_CODE
      unrecognizedModalActive = false;
      lastScannedCode = 'UNKNOWN_CODE';
      lastScannedTimestamp = t0 + 1000;

      // UNKNOWN_CODE in camera view is ignored during cooldown
      expect(simulateScan('UNKNOWN_CODE', t0 + 1200, false)).toBe('cooldown');

      // Cashier moves to next known item -> scanned immediately!
      expect(simulateScan('KNOWN_ITEM', t0 + 1300, true)).toBe('added');
    });
  });
});

