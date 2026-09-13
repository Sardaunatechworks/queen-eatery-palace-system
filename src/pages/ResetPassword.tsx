import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "../services/apiClient";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { useUI } from "../context/UIContext";
import queenLogo from "../assets/queen-logo.png";
import { Button } from "../components/ui/Button";

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setLoading, showToast } = useUI();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  useEffect(() => {
    if (!token || !email) {
      showToast("Invalid reset link. Please request a new one.", "error");
      navigate("/forgot-password");
    }
  }, [token, email, navigate, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post("/auth/reset-password", {
        token,
        email,
        password,
      });

      if (response.success) {
        setSubmitted(true);
        showToast("Password reset successful. Please sign in with your new password.", "success");
      } else {
        showToast(response.message || "Failed to reset password", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to reset password", "error");
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
              <h1 className="text-base font-semibold text-stone-900 tracking-tight">Password Updated</h1>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Your password has been changed. You can now sign in with your new credentials.
              </p>
            </div>
            <Link to="/login" className="block w-full">
              <Button variant="primary" size="md" fullWidth>
                Sign In Now
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
              Set New Password
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Choose a secure password for your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stone-700 select-none">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="w-full h-10 px-3 pr-10 bg-white border border-stone-300 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stone-700 select-none">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="w-full h-10 px-3 pr-10 bg-white border border-stone-300 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                >
                  {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <Button type="submit" variant="primary" size="lg" fullWidth>
                Save New Password
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
