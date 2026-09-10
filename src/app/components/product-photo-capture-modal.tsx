import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Zap, ZapOff, Image as ImageIcon, X, AlertCircle, RotateCw, Check } from 'lucide-react';
import { captureVideoFrameToDataUrl, compressImageFileToDataUrl, rotateImageDataUrl } from '../utils/imageCompressor';

interface ProductPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
}

export const ProductPhotoCaptureModal: React.FC<ProductPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Take Product Photo'
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Review & Adjustment step states
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileGalleryInputRef = useRef<HTMLInputElement | null>(null);

  // Tracks when the native phone camera / file-picker is open so that
  // page-visibility and keyboard events don't accidentally close the modal
  // while the user is taking a photo outside the app.
  const nativePickerActiveRef = useRef(false);

  // Stop camera tracks cleanly
  const stopTracks = (s?: MediaStream | null) => {
    const target = s || streamRef.current || stream;
    if (target) {
      target.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    if (!s || s === streamRef.current) {
      streamRef.current = null;
    }
  };

  // Sync active MediaStream to HTML5 video element with play() promise handling
  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.warn('[ProductCamera] Video play deferred/error:', err);
        });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Start live in-app camera stream
  const startCamera = async (mode: 'environment' | 'user') => {
    setIsInitializing(true);
    setCameraError(null);
    stopTracks();

    const hasGUM = Boolean(
      typeof navigator !== 'undefined' &&
        (navigator?.mediaDevices?.getUserMedia || (navigator as any)?.getUserMedia)
    );

    if (!hasGUM) {
      setCameraError('Native Mobile Camera mode active (LAN HTTP context). Tap below to snap your photo.');
      setIsInitializing(false);
      return;
    }

    const constraintAttempts: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      {
        video: {
          facingMode: mode,
        },
      },
      {
        video: true,
      },
    ];

    let activeStream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of constraintAttempts) {
      try {
        if (navigator?.mediaDevices?.getUserMedia) {
          activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        } else if ((navigator as any)?.getUserMedia) {
          activeStream = await new Promise<MediaStream>((resolve, reject) => {
            (navigator as any).getUserMedia(constraints, resolve, reject);
          });
        }
        if (activeStream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!activeStream) {
      console.warn('[ProductCamera] Could not acquire live video stream:', lastError);
      setCameraError(
        lastError?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access or upload an image from gallery.'
          : 'Could not access device camera. Please use the capture options below.'
      );
      setIsInitializing(false);
      return;
    }

    streamRef.current = activeStream;
    setStream(activeStream);

    // Check torch capability
    const track = activeStream.getVideoTracks()[0];
    if (track && 'getCapabilities' in track) {
      const caps = (track.getCapabilities as any)();
      setHasTorch(Boolean(caps?.torch));
    } else {
      setHasTorch(false);
    }
    setIsTorchOn(false);

    if (videoRef.current) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((err) => {
        console.warn('[ProductCamera] Video play deferred:', err);
      });
    }

    setIsInitializing(false);
  };

  useEffect(() => {
    if (isOpen) {
      setPreviewImage(null);
      setRotation(0);
      setIsConfirming(false);
      startCamera(facingMode);
    } else {
      stopTracks();
      setStream(null);
      setPreviewImage(null);
      setRotation(0);
      setIsConfirming(false);
      setIsTorchOn(false);
    }

    return () => {
      stopTracks();
    };
  }, [isOpen, facingMode]);

  // When the page comes back into view after the native camera / gallery app
  // closes, restart the in-app stream only if it was lost and we are not in preview mode.
  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (document.hidden) return; // going to background — nothing to do yet

      nativePickerActiveRef.current = false;
      // Only restart stream if user is not reviewing a photo and stream was lost
      if (!previewImage && !streamRef.current) {
        startCamera(facingMode);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOpen, facingMode, previewImage]);

  // Keyboard shortcut listener:
  // - Escape: close modal
  // - Space: snap photo (in live viewfinder mode, when not focused on a button)
  // - Enter: accept/use photo (in review mode, when not focused on a button)
  // - 'r' / 'R': rotate 90° clockwise (in review mode)
  // - Backspace / Delete: retake / discard photo (in review mode)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (nativePickerActiveRef.current) return; // native picker is open — ignore

      // Never hijack keystrokes when user is focused on an input or button
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
      if (targetTag === 'BUTTON') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === ' ' && stream && !isCapturing && !previewImage) {
        e.preventDefault();
        handleSnapPhoto();
      } else if (e.key === 'Enter' && previewImage && !isConfirming) {
        e.preventDefault();
        handleAcceptPhoto();
      } else if ((e.key === 'r' || e.key === 'R') && previewImage && !isConfirming) {
        e.preventDefault();
        handleRotate();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && previewImage && !isConfirming) {
        e.preventDefault();
        handleRetake();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, stream, isCapturing, previewImage, rotation, isConfirming]);

  const handleClose = () => {
    stopTracks();
    setStream(null);
    setPreviewImage(null);
    setRotation(0);
    setIsConfirming(false);
    setIsTorchOn(false);
    onClose();
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }] as any,
        });
        setIsTorchOn(nextState);
      } catch (err) {
        console.warn('[ProductCamera] Torch toggle error:', err);
      }
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Capture frame from active video element and open Review & Adjustment step
  const handleSnapPhoto = () => {
    if (!videoRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      const dataUrl = captureVideoFrameToDataUrl(videoRef.current, 1200, 0.88);
      if (dataUrl) {
        // Stop stream cleanly and switch to Review & Adjustment mode
        stopTracks();
        setStream(null);
        setPreviewImage(dataUrl);
        setRotation(0);
      } else {
        setCameraError('Failed to capture frame. Please try again or choose from gallery.');
      }
    } catch (err: any) {
      console.error('[ProductCamera] Capture failed:', err);
      setCameraError('Capture error. Please select image from device.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Safe file upload handler for gallery and external camera fallback
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    nativePickerActiveRef.current = false;

    const file = e.target.files?.[0];
    if (!file) return;

    setIsCapturing(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl) {
        // Stop stream cleanly and switch to Review & Adjustment mode
        stopTracks();
        setStream(null);
        setPreviewImage(dataUrl);
        setRotation(0);
      } else {
        setCameraError('Could not process photo. Please choose another image.');
      }
    } catch (err) {
      console.error('[ProductCamera] File compression error:', err);
      setCameraError('Image processing error. Please try again.');
    } finally {
      setIsCapturing(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Rotate captured photo 90° clockwise monotonically to prevent backward-spin glitch
  const handleRotate = () => {
    setRotation((prev) => prev + 90);
  };

  // Normalized rotation in 0..359 range for badges and canvas export
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  // Discard preview and restart live camera viewfinder
  const handleRetake = () => {
    setPreviewImage(null);
    setRotation(0);
    startCamera(facingMode);
  };

  // Accept photo, bake in rotation if rotated, and emit final photo
  const handleAcceptPhoto = async () => {
    if (!previewImage || isConfirming) return;
    setIsConfirming(true);

    try {
      let finalDataUrl = previewImage;
      if (normalizedRotation !== 0) {
        finalDataUrl = await rotateImageDataUrl(previewImage, normalizedRotation, 0.90);
      }
      stopTracks();
      setStream(null);
      onCapture(finalDataUrl);
      handleClose();
    } catch (err) {
      console.error('[ProductCamera] Accept photo error:', err);
      onCapture(previewImage);
      handleClose();
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 font-sans animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-[var(--border)]"
        style={{ background: 'var(--panel)', color: 'var(--ink)' }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-4 py-3.5 border-b"
          style={{ borderColor: 'var(--rule2)', background: 'var(--sub)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {previewImage ? 'Review & Adjust Photo' : title}
              </h3>
              <p className="text-[10px] text-[var(--ink3)]">
                {previewImage
                  ? 'Rotate if tilted or inverted, retake if blurry, or click Accept'
                  : 'In-app photo capture with auto pure-white background enhancement'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close camera"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink2)] hover:text-[var(--ink)] hover:bg-[var(--panel)] transition-colors cursor-pointer border border-[var(--border2)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Viewport Area: Review Mode OR Live Viewfinder */}
        {previewImage ? (
          <div className="relative bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[55vh] overflow-hidden p-4 select-none">
            {/* Captured image with live rotation feedback */}
            <div className="relative flex items-center justify-center w-full h-full max-h-[50vh]">
              <img
                src={previewImage}
                alt="Captured product preview"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.25s cubic-bezier(0.2, 0, 1, 1)',
                  maxHeight: normalizedRotation % 180 === 0 ? '48vh' : '36vh',
                  maxWidth: normalizedRotation % 180 === 0 ? '100%' : '48vh',
                }}
                className="object-contain select-none shadow-2xl rounded-xl ring-1 ring-white/10"
              />
            </div>

            {/* Review Badge */}
            <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-xs text-[10px] font-bold text-sky-400 border border-sky-500/30 shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span>REVIEW & ADJUST</span>
            </div>

            {/* Rotation Status Badge */}
            {normalizedRotation !== 0 && (
              <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold shadow">
                <RotateCw size={12} />
                <span>Rotated {normalizedRotation}°</span>
              </div>
            )}

            {/* Hint overlay */}
            <div className="absolute bottom-2.5 left-0 right-0 text-center pointer-events-none px-4">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-medium bg-black/75 text-slate-300 backdrop-blur-xs border border-white/10">
                Rotate to fix angle • Retake if blurry • Auto pure-white enhancement applied on accept
              </span>
            </div>
          </div>
        ) : (
          <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[55vh] overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-contain max-h-[55vh] bg-black select-none ${stream ? 'block' : 'hidden'}`}
            />

            {stream ? (
              <>
                {/* Viewfinder targeting reticle */}
                <div className="absolute inset-8 sm:inset-12 border border-white/40 rounded-xl pointer-events-none flex flex-col justify-between p-2.5">
                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-t-2 border-l-2 border-[var(--accent)] rounded-tl-sm" />
                    <div className="w-5 h-5 border-t-2 border-r-2 border-[var(--accent)] rounded-tr-sm" />
                  </div>
                  <div className="text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-white/90 backdrop-blur-xs">
                      Position product inside frame
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-b-2 border-l-2 border-[var(--accent)] rounded-bl-sm" />
                    <div className="w-5 h-5 border-b-2 border-r-2 border-[var(--accent)] rounded-br-sm" />
                  </div>
                </div>

                {/* Live Badge */}
                <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>LIVE CAMERA</span>
                </div>

                {/* In-viewfinder control buttons */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      aria-label={isTorchOn ? 'Turn light off' : 'Turn light on'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-xs ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 shadow-md'
                          : 'bg-black/60 text-white border border-white/20 hover:bg-black/80'
                      }`}
                    >
                      {isTorchOn ? <Zap size={16} /> : <ZapOff size={16} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    title="Switch Front / Rear Camera"
                    aria-label="Switch Front / Rear Camera"
                    className="w-9 h-9 rounded-full bg-black/60 text-white border border-white/20 flex items-center justify-center hover:bg-black/80 cursor-pointer backdrop-blur-xs transition-colors"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </>
            ) : (
              /* Fallback Screen when live camera is unavailable or loading */
              <div className="flex flex-col items-center justify-center p-6 text-center select-none max-w-sm">
                {isInitializing ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-slate-300 font-medium">Initializing camera...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3.5">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center border"
                      style={{ background: 'var(--sub)', borderColor: 'var(--border2)' }}
                    >
                      {cameraError?.includes('Native Mobile Camera') ? (
                        <Camera size={26} className="text-emerald-400" />
                      ) : (
                        <AlertCircle size={26} className="text-amber-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        {cameraError?.includes('Native Mobile Camera')
                          ? 'Device Camera Ready'
                          : cameraError?.includes('denied')
                          ? 'Camera Access Required'
                          : 'Live Camera Stream Inactive'}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-[300px]">
                        {cameraError?.includes('Native Mobile Camera')
                          ? 'Tap below to open your phone camera. After snapping, you can rotate and adjust your photo.'
                          : cameraError || 'Use the photo options below to capture or select a picture.'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 w-full pt-1">
                      <button
                        type="button"
                        onClick={() => { nativePickerActiveRef.current = true; fileCameraInputRef.current?.click(); }}
                        className="w-full h-11 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-md"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        <Camera size={16} />
                        <span>📸 Open Phone Camera (Tap to Snap)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { nativePickerActiveRef.current = true; fileGalleryInputRef.current?.click(); }}
                        className="w-full h-10 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
                      >
                        <ImageIcon size={15} />
                        <span>Choose from Gallery / Photos</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hidden fallback file inputs */}
        <input
          ref={fileCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={fileGalleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Bottom Action Bar */}
        {previewImage ? (
          <div
            className="p-3.5 sm:p-4 flex items-center justify-between gap-2.5 border-t"
            style={{ borderColor: 'var(--rule2)', background: 'var(--sub)' }}
          >
            {/* Retake Button */}
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleRetake}
              aria-label="Retake photo"
              className="h-11 px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer text-[var(--ink)] bg-[var(--panel)] border-[var(--border2)] hover:bg-[var(--sub)] disabled:opacity-50"
              title="Discard this photo and take a new one"
            >
              <RefreshCw size={14} />
              <span>Retake</span>
            </button>

            {/* Rotate Button (90° clockwise rotation) */}
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleRotate}
              aria-label="Rotate photo 90 degrees clockwise"
              title="Rotate 90° Clockwise (0°, 90°, 180°, 270°)"
              className="h-11 px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-transform active:scale-95 cursor-pointer text-[var(--ink)] bg-[var(--panel)] border-[var(--border2)] hover:border-[var(--accent)] hover:text-[var(--accent)] shadow-xs disabled:opacity-50"
            >
              <RotateCw size={14} />
              <span>Rotate 90°</span>
              {normalizedRotation !== 0 && (
                <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-500 font-bold">
                  {normalizedRotation}°
                </span>
              )}
            </button>

            {/* Accept / Use Photo Button */}
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleAcceptPhoto}
              aria-label="Accept and use photo"
              className="flex-1 sm:flex-initial sm:min-w-[160px] h-11 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              <Check size={16} />
              <span>{isConfirming ? 'Processing...' : 'Accept / Use Photo'}</span>
            </button>
          </div>
        ) : (
          <div
            className="p-4 flex items-center justify-between gap-3 border-t"
            style={{ borderColor: 'var(--rule2)', background: 'var(--sub)' }}
          >
            <button
              type="button"
              onClick={() => { nativePickerActiveRef.current = true; fileGalleryInputRef.current?.click(); }}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer"
              style={{ background: 'var(--panel)', borderColor: 'var(--border2)', color: 'var(--ink)' }}
              title="Pick an existing picture from your phone"
            >
              <ImageIcon size={14} />
              <span className="hidden sm:inline">Choose from</span>
              <span>Gallery</span>
            </button>

            {stream ? (
              <button
                type="button"
                disabled={isCapturing}
                onClick={handleSnapPhoto}
                className="flex-1 sm:flex-initial sm:min-w-[170px] h-12 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 text-white shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <Camera size={18} />
                <span>{isCapturing ? 'Processing...' : 'Snap Photo'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { nativePickerActiveRef.current = true; fileCameraInputRef.current?.click(); }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 text-white cursor-pointer shadow-md transition-transform active:scale-95"
                  style={{ background: 'var(--accent)' }}
                >
                  <Camera size={14} />
                  <span>Snap Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border text-[var(--ink2)] hover:text-[var(--ink)] cursor-pointer"
                  style={{ background: 'var(--panel)', borderColor: 'var(--border2)' }}
                >
                  Retry Stream
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-2 rounded-xl text-xs font-semibold border text-[var(--ink3)] hover:text-[var(--ink)] cursor-pointer"
              style={{ background: 'var(--panel)', borderColor: 'var(--border2)' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
