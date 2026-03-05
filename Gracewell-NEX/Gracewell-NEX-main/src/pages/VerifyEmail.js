import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './VerifyEmail.css';
import { apiClient } from '../utils/authService';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verifyEmail = async () => {
      const email = searchParams.get('email');
      const token = searchParams.get('token') || searchParams.get('token_hash') || searchParams.get('otp');
      const type = searchParams.get('type') || 'email';

      if (!email || !token) {
        setStatus('error');
        setMessage('Invalid verification link. Missing email or token.');
        return;
      }

      try {
        const { data } = await apiClient.post('/auth/verify-email', {
          email,
          token,
          type
        });

        if (data?.success) {
          setStatus('success');
          setMessage('Email verified successfully! You can return to the app.');
        } else {
          setStatus('error');
          setMessage(data?.message || 'Verification failed.');
        }
      } catch (error) {
        setStatus('error');
        setMessage(error?.response?.data?.message || 'Verification failed.');
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="verify-email-container">
      <div className={`verify-email-card ${status}`}>
        <div className="card-header">
          <h1>Email Verification</h1>
        </div>
        <div className="card-body">
          <p className="status-message">{message}</p>
          <div className="card-actions">
            <button className="btn-primary" onClick={() => navigate('/profile')}>
              Go to Profile
            </button>
            <button className="btn-secondary" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
