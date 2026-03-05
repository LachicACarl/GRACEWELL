import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './FaceAuth.css';

const FaceAuth = ({ setUser }) => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [useStaticImage, setUseStaticImage] = useState(true);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [stream, setStream] = useState(null);

  // Mock users database with face recognition data
  const MOCK_USERS = [
    { 
      id: 'E001', 
      name: 'John Doe', 
      role: 'admin', 
      email: 'john@company.com',
      faceId: 'face_001',
      status: 'Active'
    },
    { 
      id: 'E002', 
      name: 'Jane Smith', 
      role: 'manager', 
      email: 'jane@company.com',
      faceId: 'face_002',
      status: 'Active'
    },
    { 
      id: 'E003', 
      name: 'Bob Johnson', 
      role: 'employee', 
      email: 'bob@company.com',
      faceId: 'face_003',
      status: 'Active'
    },
  ];

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setStatus('ready');
        setMessage('Camera ready. Position your face in the frame.');
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setStatus('error');
      setMessage('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setStatus('uploading');
      setMessage('Loading image...');
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
        setStatus('ready');
        setMessage('Image uploaded. Click "Scan Face" to authenticate.');
      };
      reader.onerror = () => {
        setStatus('error');
        setMessage('Failed to load image. Please try again.');
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleAuthMode = () => {
    setUseStaticImage(!useStaticImage);
    setUploadedImage(null);
    setStatus('idle');
    setMessage('');
    if (!useStaticImage) {
      stopCamera();
    }
  };

  const simulateFaceRecognition = () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // 90% success rate for simulation
        if (Math.random() > 0.1) {
          const randomUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
          resolve({ success: true, user: randomUser });
        } else {
          resolve({ success: false, error: 'Face not recognized' });
        }
      }, 2000);
    });
  };

  const handleScanFace = async () => {
    if (useStaticImage) {
      if (!uploadedImage) {
        setStatus('error');
        setMessage('Please upload a photo first.');
        return;
      }
    } else {
      if (!stream || !videoRef.current) {
        setStatus('error');
        setMessage('Camera not ready. Please start the camera first.');
        return;
      }
    }

    setScanning(true);
    setStatus('scanning');
    setMessage('Scanning face...');

    try {
      if (!useStaticImage) {
        // Capture frame from video
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
      }

      // Simulate face recognition
      const result = await simulateFaceRecognition();

      if (result.success) {
        setStatus('success');
        setMessage(`Welcome back, ${result.user.name}!`);
        
        // Save user to sessionStorage and localStorage
        const userData = {
          ...result.user,
          loginMethod: 'face-auth',
          loginTime: new Date().toISOString()
        };
        
        sessionStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);

        // Navigate to appropriate dashboard
        setTimeout(() => {
          switch (result.user.role) {
            case 'admin':
              navigate('/admin');
              break;
            case 'manager':
              navigate('/manager');
              break;
            case 'employee':
              navigate('/employee');
              break;
            default:
              navigate('/employee');
          }
        }, 1500);
      } else {
        setStatus('error');
        setMessage('Face not recognized. Please try again or use standard login.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Authentication failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="face-auth-container">
      <div className="face-auth-content">
        <div className="face-auth-header">
          <h1>Face Authentication</h1>
          <p>Secure login with facial recognition</p>
        </div>

        <div className="auth-mode-toggle">
          <button 
            className={`mode-btn ${useStaticImage ? 'active' : ''}`}
            onClick={() => setUseStaticImage(true)}
          >
            📤 Upload Photo
          </button>
          <button 
            className={`mode-btn ${!useStaticImage ? 'active' : ''}`}
            onClick={() => setUseStaticImage(false)}
          >
            📷 Live Camera
          </button>
        </div>

        <div className="face-scanner">
          {useStaticImage ? (
            <div className="upload-section">
              {uploadedImage ? (
                <div className="uploaded-preview">
                  <img src={uploadedImage} alt="Uploaded face" className="uploaded-face-image" />
                </div>
              ) : (
                <div className="upload-placeholder">
                  <label htmlFor="face-upload" className="upload-label">
                    <div className="upload-icon">📁</div>
                    <p>Click to upload your photo</p>
                    <p className="upload-hint">Supported: JPG, PNG</p>
                  </label>
                  <input 
                    id="face-upload"
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="camera-section">
              <div className="video-container">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="face-video"
                ></video>
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                {!stream && (
                  <div className="camera-overlay">
                    <div className="camera-icon">📷</div>
                    <p>Camera not started</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="scan-indicator">
            <div className={`scanner-line ${scanning ? 'active' : ''}`}></div>
          </div>
        </div>

        <div className={`status-message ${status}`}>
          {message && <p>{message}</p>}
        </div>

        <div className="button-group">
          {useStaticImage ? (
            <>
              {uploadedImage && (
                <button 
                  className="action-btn scan-btn" 
                  onClick={handleScanFace}
                  disabled={scanning}
                >
                  {scanning ? '🔄 Scanning...' : '🔍 Scan Face'}
                </button>
              )}
              <label htmlFor="face-upload" className="action-btn upload-btn">
                📤 {uploadedImage ? 'Change Photo' : 'Upload Photo'}
              </label>
            </>
          ) : (
            <>
              {!stream ? (
                <button className="action-btn start-btn" onClick={startCamera}>
                  📷 Start Camera
                </button>
              ) : (
                <>
                  <button 
                    className="action-btn scan-btn" 
                    onClick={handleScanFace}
                    disabled={scanning}
                  >
                    {scanning ? '🔄 Scanning...' : '🔍 Scan Face'}
                  </button>
                  <button className="action-btn stop-btn" onClick={stopCamera}>
                    ⏹️ Stop Camera
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <div className="auth-instructions">
          <h3>Instructions:</h3>
          <ul>
            {useStaticImage ? (
              <>
                <li>Upload a clear photo of your face</li>
                <li>Ensure good lighting and face is visible</li>
                <li>Click "Scan Face" to authenticate</li>
              </>
            ) : (
              <>
                <li>Click "Start Camera" to activate webcam</li>
                <li>Position your face within the frame</li>
                <li>Ensure good lighting and face is clearly visible</li>
                <li>Click "Scan Face" when ready</li>
              </>
            )}
          </ul>
        </div>

        <div className="back-to-login">
          <button onClick={() => navigate('/login')} className="back-btn">
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaceAuth;
