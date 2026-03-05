import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './FaceDetection.css';
import { apiClient, logAudit } from '../utils/authService';

const FaceDetection = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [stream, setStream] = useState(null);

  React.useEffect(() => {
    if (!user || user.userRole !== 'employee') {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  React.useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
        setStream(mediaStream);
        setCameraActive(true);
      }
    } catch (error) {
      alert('Camera access denied or unavailable: ' + error.message);
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleScanClick = async () => {
    if (!cameraActive) {
      await startCamera();
      return;
    }

    try {
      setCapturing(true);
      const imageData = captureImage();
      
      if (!imageData) {
        alert('Failed to capture image');
        setCapturing(false);
        return;
      }

      // Convert base64 to blob for upload
      const blob = await (await fetch(imageData)).blob();
      const formData = new FormData();
      formData.append('image', blob, 'face-capture.jpg');
      formData.append('employeeId', user?.employeeId);
      formData.append('method', 'face');

      await apiClient.post('/attendance/check-in', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      await logAudit('FACE_ATTENDANCE', {
        employeeId: user?.employeeId,
        action: 'check-in',
        method: 'face'
      });

      alert('✅ Face check-in submitted successfully!');
      
      // Stop camera after successful capture
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setCameraActive(false);
        setStream(null);
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        onLogout();
        navigate('/login');
        return;
      }
      alert(error?.response?.data?.message || 'Face check-in failed.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="face-detection-container">
      <Navbar user={user} onLogout={onLogout} />

      <div className="face-detection-content">
        <div className="scan-box">
          <div className="camera-frame">
            {cameraActive ? (
              <video 
                ref={videoRef} 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                autoPlay
                playsInline
              />
            ) : (
              <div className="camera-placeholder">
                <span style={{ fontSize: '48px' }}>📷</span>
                <p>Face Detection Camera</p>
                <p style={{ fontSize: '12px', color: '#999' }}>
                  {cameraActive ? 'Camera Active' : 'Click Start to activate camera'}
                </p>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
          
          <div className="scan-info">
            <h2>Employee Check-in</h2>
            <p id="instruction">
              {cameraActive ? 'Position your face and click Capture' : 'Click to start camera'}
            </p>
            <button 
              className="scan-btn" 
              onClick={handleScanClick}
              disabled={capturing}
            >
              {capturing ? '⏳ Capturing...' : cameraActive ? '📸 Capture Face' : '🔍 Start Camera'}
            </button>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '20px' }}>
              Position your face within the frame
            </p>
          </div>
        </div>

        <div className="recent-activity">
          <h3>Recent Activity</h3>
          <div className="activity-log">
            <div className="log-item">
              <span>Check-in Successful</span>
              <span className="time">Today, 09:15 AM</span>
            </div>
            <div className="log-item">
              <span>Check-out Successful</span>
              <span className="time">Yesterday, 05:45 PM</span>
            </div>
            <div className="log-item">
              <span>Check-in Successful</span>
              <span className="time">Jan 18, 2026, 09:10 AM</span>
            </div>
            <div className="log-item">
              <span>Check-out Successful</span>
              <span className="time">Jan 18, 2026, 05:50 PM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceDetection;
