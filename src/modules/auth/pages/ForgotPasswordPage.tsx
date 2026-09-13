import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../../lib/apiClient';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ApiResponse } from '../../../types';
import queenLogo from '../../../assets/queen-logo.png';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<ApiResponse>('/auth/forgot-password', { email });
      if (response.success) {
        setSubmitted(true);
      } else {
        setError(response.message || 'Failed to process request');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to send reset instructions';
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
            Reset Password
          </h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mt-1">
            Enter your email to receive recovery instructions
          </p>
        </div>

        <div className="bg-white rounded-[var(--radius-2xl)] border border-[var(--color-border)] p-6 shadow-[var(--shadow-sm)]">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] flex items-center justify-center mx-auto mb-3 text-xl">
                ✓
              </div>
              <h2 className="text-[var(--text-md)] font-semibold text-[var(--color-text-primary)] mb-2">
                Check your inbox
              </h2>
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mb-6">
                If an account exists for {email}, a recovery link has been dispatched.
              </p>
              <Link to="/login">
                <Button fullWidth variant="secondary">
                  Return to Login
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
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
              />

              <Button type="submit" loading={loading} fullWidth size="lg">
                Send Recovery Link
              </Button>

              <div className="text-center mt-2">
                <Link
                  to="/login"
                  className="text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:text-[var(--color-brand-red)]"
                >
                  ← Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
