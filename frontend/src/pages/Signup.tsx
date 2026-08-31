import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Please enter a valid work email'),
  phone: z.string().optional().refine((val) => {
    if (!val || val.trim() === '') return true;
    return /^\+?[0-9]{10,15}$/.test(val.trim());
  }, { message: 'Please enter a valid phone number (10–15 digits)' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function Signup() {
  const [apiError, setApiError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    setApiError(null);
    try {
      // 1. Call backend register endpoint
      await api.post('/register', {
        name: data.fullName,
        email: data.email,
        phone: data.phone || '',
        password: data.password,
        consent: true
      });

      // 2. Set submitted email to display confirmation prompt
      setSubmittedEmail(data.email);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setApiError(msg);
    }
  };

  const handleResend = async () => {
    if (!submittedEmail) return;
    setIsResending(true);
    setResendMessage(null);
    try {
      await api.post('/resend-confirmation', { email: submittedEmail });
      setResendMessage({ type: 'success', text: 'Confirmation email resent! Check your inbox or spam folder.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to resend email.';
      setResendMessage({ type: 'error', text: msg });
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
          <h1>Control your brand's AI narrative.</h1>
          <p>Join Signal to track, audit, and improve your visibility across all major AI models before your competitors do.</p>
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
                <div className="scanner-tick"><span className="tick-dot" style={{ background: 'var(--gpt)', color: 'var(--gpt)' }}></span><span className="tick-label">GEMINI</span></div>
                <div className="scanner-tick"><span className="tick-dot" style={{ background: 'var(--gemini)', color: 'var(--gemini)' }}></span><span className="tick-label">GEMINI</span></div>
              </div>
            </div>
          </div>
        </div>
        <div></div>
      </div>

      <div className="login-form-side">
        <div className="login-form">
          {submittedEmail ? (
            <div>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✉️</div>
              <h2>Check your email</h2>
              <p className="sub">
                We sent a confirmation link to <strong style={{ color: 'var(--amber)' }}>{submittedEmail}</strong>.
              </p>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                  Please check your inbox and click the verification link inside to activate your account.
                </p>
                {resendMessage && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '8px 12px', 
                    borderRadius: '6px', 
                    fontSize: '12px', 
                    color: resendMessage.type === 'success' ? '#16a34a' : '#ef4444', 
                    background: resendMessage.type === 'success' ? '#dcfce7' : '#fee2e2' 
                  }}>
                    {resendMessage.text}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  disabled={isResending}
                  onClick={handleResend}
                >
                  {isResending ? 'Resending email...' : 'Didn\'t get email? Resend Email'}
                </button>

                <Link to="/login" className="btn btn-primary btn-block" style={{ textAlign: 'center' }}>
                  Proceed to Login →
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <h2>Create your account</h2>
              <p className="sub">Start tracking your AI visibility score in minutes.</p>
              {apiError && <div className="error-banner" style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', padding: '0.5rem 0.75rem', background: '#fee2e2', borderRadius: '6px' }}>{apiError}</div>}
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <input 
                    type="text" 
                    id="fullName" 
                    placeholder="Jane Doe"
                    {...register('fullName')}
                  />
                  {errors.fullName && <p className="error-text">{errors.fullName.message}</p>}
                </div>
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
                  <label htmlFor="phone">Phone number (optional)</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    placeholder="+919876543210"
                    {...register('phone')}
                  />
                  {errors.phone && <p className="error-text">{errors.phone.message}</p>}
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
                  {isSubmitting ? 'Creating account...' : 'Create account →'}
                </button>
              </form>
              <div className="divider-row">or</div>
              <button type="button" className="btn btn-block">Continue with Google</button>
              <p className="foot-note">Already have an account? <Link to="/login">Log in</Link></p>
              <p className="free-check-link" style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>Want a quick test first? <Link to="/free-checker" style={{ color: '#818cf8', fontWeight: 600 }}>Get your free AI visibility score →</Link></p>
            </div>

          )}
        </div>
      </div>
    </div>
  );
}
