import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../services/apiClient";
import { Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { useUI } from "../context/UIContext";
import queenLogo from "../assets/queen-logo.png";
import { Button } from "../components/ui/Button";

export const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const { setLoading, showToast } = useUI();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (errors[name]) {
      setErrors({ ...errors, [name]: "" });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.trim().length < 2) newErrors.name = "Name must be at least 2 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = "Please enter a valid email address";
    if (formData.phone.replace(/\D/g, "").length < 10)
      newErrors.phone = "Please enter a valid phone number";
    if (formData.address.trim().length < 5)
      newErrors.address = "Please enter your delivery address in Dutse";
    if (formData.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculatePasswordStrength = (password: string) => {
    if (!password) return 0;
    let score = 0;
    if (password.length > 5) score += 25;
    if (password.length > 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[0-9!@#$%^&*]/.test(password)) score += 25;
    return score;
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const response = await apiClient.post("/auth/signup", {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        password: formData.password,
      });

      if (response.success) {
        setRegisteredEmail(formData.email);
        setShowVerificationModal(true);
      } else {
        showToast(response.message || "Signup failed. Please try again.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Signup failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-white p-7 sm:p-9 rounded-xl border border-stone-200 shadow-xs">
          <div className="flex flex-col items-center mb-6 text-center">
            <Link to="/" className="inline-block mb-3">
              <img src={queenLogo} alt="Queen's Palace" className="h-12 w-auto object-contain" />
            </Link>
            <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
              Create Customer Account
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Order meals online, track deliveries, and save favorite dishes
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-700 select-none">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Amina Bello"
                  className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                    errors.name ? "border-red-400" : "border-stone-300"
                  }`}
                  value={formData.name}
                  onChange={handleChange}
                />
                {errors.name && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={11} /> {errors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-700 select-none">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@example.com"
                  className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                    errors.email ? "border-red-400" : "border-stone-300"
                  }`}
                  value={formData.email}
                  onChange={handleChange}
                />
                {errors.email && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={11} /> {errors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-700 select-none">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  placeholder="080 1234 5678"
                  className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                    errors.phone ? "border-red-400" : "border-stone-300"
                  }`}
                  value={formData.phone}
                  onChange={handleChange}
                />
                {errors.phone && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={11} /> {errors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-700 select-none">
                  Delivery Address (Dutse)
                </label>
                <input
                  type="text"
                  name="address"
                  required
                  placeholder="Street / Area in Dutse"
                  className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                    errors.address ? "border-red-400" : "border-stone-300"
                  }`}
                  value={formData.address}
                  onChange={handleChange}
                />
                {errors.address && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1">
                    <AlertCircle size={11} /> {errors.address}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-700 select-none">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    placeholder="••••••••"
                    className={`w-full h-10 px-3 pr-10 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                      errors.password ? "border-red-400" : "border-stone-300"
                    }`}
                    value={formData.password}
                    onChange={handleChange}
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
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    required
                    placeholder="••••••••"
                    className={`w-full h-10 px-3 pr-10 bg-white border rounded-lg text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15 transition-colors ${
                      errors.confirmPassword ? "border-red-400" : "border-stone-300"
                    }`}
                    value={formData.confirmPassword}
                    onChange={handleChange}
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
            </div>

            {formData.password && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-500">
                  <span>Password strength</span>
                  <span className="font-medium">
                    {passwordStrength < 50 ? "Weak" : passwordStrength < 75 ? "Good" : "Strong"}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      passwordStrength < 50
                        ? "bg-red-500 w-1/3"
                        : passwordStrength < 75
                        ? "bg-amber-500 w-2/3"
                        : "bg-emerald-600 w-full"
                    }`}
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" variant="primary" size="lg" fullWidth>
                Create Account
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 text-center border-t border-stone-100 text-xs text-stone-500">
            <span>Already have an account? </span>
            <Link to="/login" className="font-semibold text-[#8B1E1E] hover:underline">
              Sign In
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

      {/* Verification Dialog */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl max-w-sm w-full p-6 text-center space-y-4 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-900">Account Registered</h3>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                We've set up your account for <strong>{registeredEmail}</strong>. You can now sign
                in and start ordering.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => navigate("/login")}
            >
              Continue to Sign In
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
