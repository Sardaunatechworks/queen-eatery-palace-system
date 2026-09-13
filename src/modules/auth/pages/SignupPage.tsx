import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { apiClient } from '../../../lib/apiClient';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ApiResponse, AuthTokens } from '../../../types';
import queenLogo from '../../../assets/queen-logo.png';

export const SignupPage: React.FC = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const updateField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post<ApiResponse<AuthTokens>>('/auth/signup', formData);

      if (response.success && response.data) {
        const { profile } = response.data;
        login(profile);
        toast.success('Account created! Welcome to Queen\'s Palace.');
        navigate('/dashboard');
      } else {
        setError(response.message || 'Signup failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed. Please try again.';
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
            Create Account
          </h1>
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] mt-1">
            Join Queen's Palace to order food online
          </p>
        </div>

        <div className="bg-white rounded-[var(--radius-2xl)] border border-[var(--color-border)] p-6 shadow-[var(--shadow-sm)]">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-error-light)] text-[var(--color-error)] text-[var(--text-sm)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Full name"
              value={formData.full_name}
              onChange={updateField('full_name')}
              placeholder="John Doe"
              required
              autoFocus
              autoComplete="name"
            />

            <Input
              label="Email address"
              type="email"
              value={formData.email}
              onChange={updateField('email')}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />

            <Input
              label="Phone number"
              type="tel"
              value={formData.phone}
              onChange={updateField('phone')}
              placeholder="+234 xxx xxxx xxx"
              hint="Optional"
              autoComplete="tel"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={updateField('password')}
                placeholder="Minimum 8 characters"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors text-xs"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <Button type="submit" loading={loading} fullWidth size="lg">
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
              Already have an account?{' '}
              <Link to="/login" className="text-[var(--color-brand-red)] font-medium hover:underline">
                Sign in
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
