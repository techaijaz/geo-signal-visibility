import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid work email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const emailValue = watch('email');

  const onSubmit = async (data: LoginFormValues) => {
    setApiError(null);
    setUnconfirmedEmail(null);
    setResendStatus(null);
    try {
      const res = await api.post('/login', {
        email: data.email,
        password: data.password,
      });

      const { accessToken, refreshToken, user: userPayload } = res.data.data;
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }
      login(accessToken, userPayload);

      try {
        const brandsRes = await api.get('/orgs/brands');
        const brands = brandsRes.data?.data?.brands || [];
        if (brands.length === 0) {
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      } catch {
        navigate('/onboarding');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Invalid email or password';
      setApiError(msg);
      if (err.response?.status === 403 || msg.toLowerCase().includes('confirm your email')) {
        setUnconfirmedEmail(data.email);
      }
    }
  };

  const handleResend = async () => {
    const emailToUse = unconfirmedEmail || emailValue;
    if (!emailToUse) return;
    setIsResending(true);
    setResendStatus(null);
    try {
      await api.post('/resend-confirmation', { email: emailToUse });
      setResendStatus('Confirmation email sent successfully! Please check your inbox.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to resend confirmation email.';
      setResendStatus(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-side">
        <Link to="/" className="brand-mark">
          <span className="dot"></span>
          <span>Signal</span>
        </Link>
        <div className="login-copy">
          <h1>See what AI recommends<br />before your customers do.</h1>
          <p>Signal tracks how Claude, ChatGPT, and Gemini answer real buying questions about your category — and tells you exactly what to fix so they recommend you.</p>
          <div className="scanner">
            <div className="scanner-row">
              <span className="scanner-label">Live scan</span>
              <span className="scanner-label mono">3 models · continuous</span>
            </div>
            <div className="scanner-track">
              <div className="scanner-grid"></div>
              <div className="scanner-sweep"></div>
              <div className="scanner-ticks">
                <div className="scanner-tick"><span className="tick-dot" style={{ background: 'var(--claude)', color: 'var(--claude)' }}></span><span className="tick-label">CLAUDE</span></div>
                <div className="scanner-tick"><span className="tick-dot" style={{ background: 'var(--gpt)', color: 'var(--gpt)' }}></span><span className="tick-label">GPT</span></div>
                <div className="scanner-tick"><span className="tick-dot" style={{ background: 'var(--gemini)', color: 'var(--gemini)' }}></span><span className="tick-label">GEMINI</span></div>
              </div>
            </div>
          </div>
        </div>
        <div></div>
      </div>
      <div className="login-form-side">
        <div className="login-form">
          <h2>Welcome back</h2>
          <p className="sub">Log in to your visibility dashboard.</p>
          {apiError && (
            <div className="error-banner" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', padding: '0.75rem', background: '#fee2e2', borderRadius: '6px' }}>
              {apiError}
              {unconfirmedEmail && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#b91c1c', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: '0.85rem', fontWeight: 600 }}
                    onClick={handleResend}
                    disabled={isResending}
                  >
                    {isResending ? 'Resending email...' : 'Click here to resend confirmation email →'}
                  </button>
                </div>
              )}
            </div>
          )}
          {resendStatus && (
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', padding: '0.6rem 0.75rem', background: '#dcfce7', color: '#15803d', borderRadius: '6px' }}>
              {resendStatus}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input 
                type="email" 
                id="email" 
                placeholder="you@company.com"
                {...register('email')}
              />
              {errors.email && <p className="error-text">{errors.email.message}</p>}
            </div>
            <div className="field">
              <label htmlFor="pass">Password</label>
              <input 
                type="password" 
                id="pass" 
                placeholder="••••••••••"
                {...register('password')}
              />
              {errors.password && <p className="error-text">{errors.password.message}</p>}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in...' : 'Log in →'}
            </button>
          </form>
          <div className="divider-row">or</div>
          <button type="button" className="btn btn-block">Continue with Google</button>
          <p className="foot-note">New here? <Link to="/signup">Create an account</Link></p>
          <p className="free-check-link">Not ready to sign up? <Link to="/free-checker">Get your free AI visibility score →</Link></p>
        </div>

      </div>
    </div>
  );
}
