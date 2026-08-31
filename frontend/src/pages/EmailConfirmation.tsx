import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/axios';

export default function EmailConfirmation() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') || '';
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token || !code) {
      setStatus('error');
      setErrorMessage('Invalid or missing confirmation link parameters.');
      return;
    }

    const confirmAccount = async () => {
      try {
        await api.put(`/confirmation/${token}?code=${code}`);
        setStatus('success');
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Email confirmation failed.';
        setStatus('error');
        setErrorMessage(msg);
      }
    };

    confirmAccount();
  }, [token, code]);

  return (
    <div className="onb-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="onb-card" style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
        <Link to="/" className="brand-mark" style={{ justifyContent: 'center', marginBottom: '24px' }}>
          <span className="dot"></span>
          <span>Signal</span>
        </Link>

        {status === 'loading' && (
          <div>
            <h2>Activating your account...</h2>
            <p className="sub">Please wait while we verify your email confirmation link.</p>
            <div style={{ margin: '30px 0' }}>
              <span className="rescan-icon spinning" style={{ fontSize: '32px', display: 'inline-block' }}>⚙</span>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{ fontSize: '48px', color: 'var(--good)', marginBottom: '16px' }}>✓</div>
            <h2>Account Activated!</h2>
            <p className="sub">Your email has been verified successfully. You can now log in or complete your brand setup.</p>
            <div style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => navigate('/login')}
              >
                Log In to Continue →
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ fontSize: '48px', color: 'var(--bad)', marginBottom: '16px' }}>✕</div>
            <h2>Activation Failed</h2>
            <p className="sub" style={{ color: 'var(--bad)' }}>{errorMessage}</p>
            <div style={{ marginTop: '24px' }}>
              <Link to="/login" className="btn btn-primary btn-block">
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
