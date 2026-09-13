import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { apiClient } from '../../../lib/apiClient';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ApiResponse, AuthTokens } from '../../../types';
import queenLogo from '../../../assets/queen-logo.png';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<ApiResponse<AuthTokens>>('/auth/login', {
        email,
        password,
      });

      if (response.success && response.data) {
        const { profile } = response.data;
        login(profile);
        toast.success(`Welcome back, ${profile.name}!`);

        // Route by role
        const roleRoutes: Record<string, string> = {
          super_admin: '/admin/overview',
          admin: '/admin/overview',
          cashier: '/pos',
          kitchen: '/kitchen',
          customer: '/my-orders',
        };
        navigate(roleRoutes[profile.role] || '/admin/overview');
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block hover:opacity-95 transition-opacity">
            <img
              src={queenLogo}
              alt="The Queen's Palace Logo"
              className="w-20 h-20 mx-auto object-contain mb-3 drop-shadow-md"
            />
          </Link>
          <h1 className="text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">
            Queen's Palace
          </h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[var(--radius-2xl)] border border-[var(--color-border)] p-6 shadow-[var(--shadow-sm)]">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-error-light)] text-[var(--color-error)] text-[var(--text-sm)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@queenspalaceeatery.com"
              required
              autoFocus
              autoComplete="email"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors text-xs"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-[var(--text-sm)] text-[var(--color-brand-red)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" loading={loading} fullWidth size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
              Don't have an account?{' '}
              <Link to="/signup" className="text-[var(--color-brand-red)] font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-[var(--text-xs)] text-[var(--color-text-muted)] mt-6">
          © {new Date().getFullYear()} Queen's Palace Eatery & Event Hall
        </p>
      </div>
    </div>
  );
};
