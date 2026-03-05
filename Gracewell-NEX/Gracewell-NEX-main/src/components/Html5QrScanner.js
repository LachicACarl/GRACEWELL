import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const Html5QrScanner = ({ onScanSuccess, onScanError, fps = 10, qrbox = 250 }) => {
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const isScanningRef = useRef(false);
  const isInitializingRef = useRef(false);
  const onScanSuccessRef = useRef(onScanSuccess);
  const onScanErrorRef = useRef(onScanError);
  const containerIdRef = useRef(`qr-reader-container-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    onScanErrorRef.current = onScanError;
  }, [onScanError]);

  const isBenignAbortError = (err) => {
    const message = String(err?.message || err || '').toLowerCase();
    return (
      message.includes('aborterror') ||
      message.includes('play() request was interrupted') ||
      message.includes('video element has been removed')
    );
  };

  useEffect(() => {
    if (!scannerRef.current) return;

    const config = { fps, qrbox };
    let isMounted = true;

    const startScanner = async (cameraConfig) => {
      await html5QrCodeRef.current.start(
        cameraConfig,
        config,
        (decodedText) => {
          if (onScanSuccessRef.current && isMounted) {
            onScanSuccessRef.current(decodedText);
          }
        },
        (errorMessage) => {
          if (onScanErrorRef.current && errorMessage && !errorMessage.includes('NotFoundException')) {
            onScanErrorRef.current(errorMessage);
          }
        }
      );
      if (isMounted) {
        isScanningRef.current = true;
        isInitializingRef.current = false;
      }
    };
    
    // Create scanner instance
    html5QrCodeRef.current = new Html5Qrcode(containerIdRef.current);

    // Start scanning
    const startScanning = async () => {
      if (!isMounted) return;

      isInitializingRef.current = true;

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const preferredCamera =
            cameras.find((camera) => /back|rear|environment/i.test(camera?.label || '')) ||
            cameras[0];

          await startScanner(preferredCamera.id);
          return;
        }
      } catch (err) {
        // Continue to facingMode-based fallbacks
      }

      try {
        await startScanner({ facingMode: "environment" });
      } catch (err) {
        if (!isMounted) return;
        
        // If back camera fails, try front camera
        try {
          await startScanner({ facingMode: "user" });
        } catch (err2) {
          if (!isMounted) return;
          
          // If both fail, try any available camera
          try {
            await startScanner({ facingMode: { ideal: "environment" } });
          } catch (err3) {
            if (!isMounted) return;

            try {
              const cameras = await Html5Qrcode.getCameras();
              if (cameras && cameras.length > 0) {
                await startScanner(cameras[0].id);
                return;
              }
            } catch (err4) {
              if (!isBenignAbortError(err4) && onScanErrorRef.current && isMounted) {
                onScanErrorRef.current('No camera detected or camera access failed.');
              }
            }

            isInitializingRef.current = false;
            if (onScanErrorRef.current && isMounted) {
              onScanErrorRef.current('Failed to access camera. Please check permissions.');
            }
          }
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(() => {
      if (isMounted) {
        startScanning();
      }
    }, 100);

    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      
      // Give a small delay to allow any pending operations to complete
      const cleanupScanner = async () => {
        const scanner = html5QrCodeRef.current;
        if (!scanner) {
          return;
        }

        if (isScanningRef.current || isInitializingRef.current) {
          try {
            await scanner.stop();
            isScanningRef.current = false;
            isInitializingRef.current = false;
          } catch (err) {
            if (!isBenignAbortError(err)) {
              // Silently ignore non-critical stop errors to avoid noisy teardown failures
            }
            isScanningRef.current = false;
            isInitializingRef.current = false;
          }
        }

        try {
          await scanner.clear();
        } catch (err) {
          if (!isBenignAbortError(err)) {
            // Ignore clear errors during unmount race conditions
          }
        } finally {
          html5QrCodeRef.current = null;
        }
      };
      
      // Use setTimeout to avoid interrupting media playback
      setTimeout(() => {
        cleanupScanner();
      }, 50);
    };
  }, [fps, qrbox]);

  return (
    <div ref={scannerRef} style={{ width: '100%', height: '100%' }}>
      <div 
        id={containerIdRef.current}
        style={{ 
          width: '100%', 
          height: '100%',
          borderRadius: '12px',
        }}
      ></div>
    </div>
  );
};

export default Html5QrScanner;
