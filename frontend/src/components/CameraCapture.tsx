'use client';
import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

// Opens the device camera inside the page (getUserMedia), which triggers the
// browser's native camera-permission prompt. Falls back to a clear error
// message if the user denies permission or no camera is available.
export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setError(null);
      setReady(false);
      stopCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setError('Camera access was denied. Please allow camera permission for this site in your browser settings, then try again.');
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setError('No camera was found on this device.');
        } else {
          setError(`Could not access the camera: ${e.message || e.name}`);
        }
      }
    }

    startCamera();
    return () => { cancelled = true; stopCamera(); };
  }, [facingMode]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    stopCamera();
    onCapture(base64);
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  return (
    <div className="camera-backdrop" onClick={handleClose}>
      <div className="camera-modal" onClick={e => e.stopPropagation()}>
        <div className="camera-header">
          <div className="camera-title">Take Photo</div>
          <button className="camera-close" onClick={handleClose} aria-label="Close camera">✕</button>
        </div>

        {error ? (
          <div className="camera-error">
            <div className="camera-error-icon">📷</div>
            <div>{error}</div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 14 }} onClick={() => setFacingMode(f => f)}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="camera-viewport">
              <video ref={videoRef} playsInline muted className={ready ? 'ready' : ''} />
              {!ready && <div className="camera-loading"><span className="spinner spinner-white" />Requesting camera access…</div>}
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="camera-controls">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
                disabled={!ready}
              >
                ⟲ Flip Camera
              </button>
              <button className="camera-shutter" onClick={capture} disabled={!ready} aria-label="Capture photo" />
              <div style={{ width: 92 }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
