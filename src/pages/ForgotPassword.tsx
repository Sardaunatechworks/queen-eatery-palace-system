import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../services/apiClient";
import { Mail, CheckCircle } from "lucide-react";
import { useUI } from "../context/UIContext";
import queenLogo from "../assets/queen-logo.png";
import { Button } from "../components/ui/Button";

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { setLoading, showToast } = useUI();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post("/auth/forgot-password", { email });
      setSubmitted(true);
      showToast("Password reset instructions have been dispatched if the email exists.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to request password reset", "error");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white p-7 sm:p-8 rounded-xl border border-stone-200 shadow-xs text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-200 text-emerald-700">
              <CheckCircle size={24} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-stone-900 tracking-tight">Check Your Inbox</h1>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                If an account exists for <strong>{email}</strong>, we've sent password reset instructions.
              </p>
            </div>
            <Link to="/login" className="block w-full">
              <Button variant="primary" size="md" fullWidth>
                Back to Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white p-7 sm:p-8 rounded-xl border border-stone-200 shadow-xs">
          <div className="flex flex-col items-center mb-6 text-center">
            <Link to="/" className="inline-block mb-3">
              <img src={queenLogo} alt="Queen's Palace" className="h-12 w-auto object-contain" />
            </Link>
            <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
              Reset Password
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Enter your account email to receive reset instructions
            </p>
          </div>

          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stone-700 select-none">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="w-full h-10 pl-9 pr-3 bg-white border border-stone-300 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              </div>
            </div>

            <div className="pt-1">
              <Button type="submit" variant="primary" size="lg" fullWidth>
                Send Reset Link
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 text-center border-t border-stone-100 text-xs text-stone-500">
            <Link to="/login" className="font-semibold text-[#8B1E1E] hover:underline">
              ← Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
