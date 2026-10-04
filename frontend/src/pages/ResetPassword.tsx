import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/axios';

const resetSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormValues) => {
    setApiError(null);
    try {
      await api.put(`/reset-password/${token}`, { newPassword: data.newPassword });
      setDone(true);
    } catch (err: any) {
      // The API answers 404 "User not found" when the token is unknown or was already used
      if (err.response?.status === 404) {
        setApiError('This reset link is invalid or has already been used. Please request a new one.');
        return;
      }
      setApiError(err.response?.data?.message || err.message || 'Could not reset the password. Please try again.');
    }
  };

  return (
    <div className="onb-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="onb-card" style={{ width: '100%', maxWidth: '480px' }}>
        <Link to="/login" className="brand-mark" style={{ justifyContent: 'center', marginBottom: '24px' }}>
          <span className="dot"></span>
          <span>Signal</span>
        </Link>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', color: 'var(--good)', marginBottom: '16px' }}>✓</div>
            <h2>Password updated</h2>
            <p className="sub">You can now log in with your new password.</p>
            <div style={{ marginTop: '24px' }}>
              <Link to="/login" className="btn btn-primary btn-block">Log In →</Link>
            </div>
          </div>
        ) : (
          <div>
            <h2>Choose a new password</h2>
            <p className="sub">Use at least 8 characters.</p>
            {apiError && (
              <div style={{ color: '#ef4444', margin: '1rem 0', fontSize: '0.9rem', padding: '0.75rem', background: '#fee2e2', borderRadius: '6px' }}>
                {apiError}{' '}
                <Link to="/forgot-password" style={{ color: '#b91c1c', fontWeight: 600 }}>Request a new link →</Link>
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ marginTop: '20px' }}>
              <div className="field">
                <label htmlFor="newPassword">New password</label>
                <input type="password" id="newPassword" autoComplete="new-password" placeholder="••••••••••" {...register('newPassword')} />
                {errors.newPassword && <p className="error-text">{errors.newPassword.message}</p>}
              </div>
              <div className="field">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input type="password" id="confirmPassword" autoComplete="new-password" placeholder="••••••••••" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="error-text">{errors.confirmPassword.message}</p>}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Set new password →'}
              </button>
            </form>
            <p className="foot-note"><Link to="/login">Back to Login</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
