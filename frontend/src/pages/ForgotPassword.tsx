import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormValues) => {
    setApiError(null);
    try {
      await api.put('/forgot-password', { email: data.email });
      setSentTo(data.email);
    } catch (err: any) {
      // Same answer whether or not the account exists, so this form can't be used to find out who has one
      if (err.response?.status === 404) {
        setSentTo(data.email);
        return;
      }
      setApiError(err.response?.data?.message || err.message || 'Could not send the reset email. Please try again.');
    }
  };

  return (
    <div className="onb-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="onb-card" style={{ width: '100%', maxWidth: '480px' }}>
        <Link to="/login" className="brand-mark" style={{ justifyContent: 'center', marginBottom: '24px' }}>
          <span className="dot"></span>
          <span>Signal</span>
        </Link>

        {sentTo ? (
          <div style={{ textAlign: 'center' }}>
            <h2>Check your inbox</h2>
            <p className="sub">
              If an account exists for <b>{sentTo}</b>, we've sent a link to reset the password. The link works for 15 minutes.
            </p>
            <div style={{ marginTop: '24px' }}>
              <Link to="/login" className="btn btn-primary btn-block">Back to Login</Link>
            </div>
          </div>
        ) : (
          <div>
            <h2>Forgot your password?</h2>
            <p className="sub">Enter your email and we'll send you a link to choose a new one.</p>
            {apiError && (
              <div style={{ color: '#ef4444', margin: '1rem 0', fontSize: '0.9rem', padding: '0.75rem', background: '#fee2e2', borderRadius: '6px' }}>
                {apiError}
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ marginTop: '20px' }}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" placeholder="you@company.com" {...register('email')} />
                {errors.email && <p className="error-text">{errors.email.message}</p>}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send reset link →'}
              </button>
            </form>
            <p className="foot-note"><Link to="/login">Back to Login</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
