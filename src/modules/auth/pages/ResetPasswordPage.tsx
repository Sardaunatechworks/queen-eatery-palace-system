import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../lib/apiClient';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ApiResponse } from '../../../types';
import queenLogo from '../../../assets/queen-logo.png';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Password reset token is missing or invalid.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post<ApiResponse>('/auth/reset-password', {
        token,
        password,
      });

      if (response.success) {
        toast.success('Password updated successfully! Please log in.');
        navigate('/login');
      } else {
        setError(response.message || 'Password reset failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to complete password reset';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block hover:opacity-95 transition-opacity">
            <img
              src={queenLogo}
              alt="The Queen's Palace Logo"
              className="w-20 h-20 mx-auto object-contain mb-3 drop-shadow-md"
            />
          </Link>
          <h1 className="text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">
            New Password
          </h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mt-1">
            Choose a secure password for your account
          </p>
        </div>

        <div className="bg-white rounded-[var(--radius-2xl)] border border-[var(--color-border)] p-6 shadow-[var(--shadow-sm)]">
          {!token ? (
            <div className="text-center py-4">
              <div className="text-[var(--color-error)] text-3xl mb-3">⚠️</div>
              <h2 className="text-[var(--text-md)] font-semibold text-[var(--color-text-primary)] mb-2">
                Invalid Reset Link
              </h2>
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mb-6">
                This password reset link is missing a valid security token.
              </p>
              <Link to="/forgot-password">
                <Button fullWidth variant="secondary">
                  Request New Link
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-error-light)] text-[var(--color-error)] text-[var(--text-sm)]">
                  {error}
                </div>
              )}

              <Input
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoFocus
              />

              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />

              <Button type="submit" loading={loading} fullWidth size="lg">
                Update Password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
