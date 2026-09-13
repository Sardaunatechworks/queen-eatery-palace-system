import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import { useUI } from "../context/UIContext";
import queenLogo from "../assets/queen-logo.png";
import { Button } from "../components/ui/Button";

export const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { setLoading, showToast } = useUI();
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiClient.post("/auth/login", { email, password });

      if (response.success && response.data) {
        const { profile } = response.data;

        login(profile);

        showToast(
          profile.isSuperAdmin ? "Welcome back, Super Admin" : `Welcome back, ${profile.role}`,
          "success"
        );

        if (profile.role === "super_admin" || profile.role === "admin") navigate("/admin/overview");
        else if (profile.role === "cashier") navigate("/pos");
        else if (profile.role === "kitchen") navigate("/kitchen");
        else navigate("/my-orders");
      } else {
        showToast(response.message || "Invalid email or password", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Invalid credentials", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand Card */}
        <div className="bg-white p-7 sm:p-8 rounded-xl border border-stone-200 shadow-xs">
          <div className="flex flex-col items-center mb-6 text-center">
            <Link to="/" className="inline-block mb-3">
              <img src={queenLogo} alt="Queen's Palace" className="h-12 w-auto object-contain" />
            </Link>
            <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
              Sign in to Queen's Palace
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Access staff terminal, kitchen display, or customer orders
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stone-700 select-none">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                className="w-full h-10 px-3 bg-white border border-stone-300 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-stone-700 select-none">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-[#8B1E1E] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" size="lg" fullWidth>
                Sign In
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 text-center border-t border-stone-100 text-xs text-stone-500">
            <span>Don't have an account? </span>
            <Link to="/signup" className="font-semibold text-[#8B1E1E] hover:underline">
              Create customer account
            </Link>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link
            to="/"
            className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
          >
            ← Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
};
