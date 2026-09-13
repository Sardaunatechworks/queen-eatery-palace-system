import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { apiClient } from "../../services/apiClient";
import imageCompression from "browser-image-compression";
import { User, Mail, Phone, MapPin, Lock, Camera, KeyRound } from "lucide-react";
import { PageHeader, Badge } from "../../components/ui";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export const ProfileSettings: React.FC = () => {
  const { profile, login } = useAuth();
  const { showToast } = useUI();

  // Profile fields state
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || "");

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Loading states
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Dialogs
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthPendingAction, setReauthPendingAction] = useState<"email" | "password" | null>(null);

  // Image Upload handler
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB", "error");
      return;
    }

    try {
      setUploadingPhoto(true);

      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);

      const formData = new FormData();
      formData.append("image", compressedFile, file.name);

      const response = await apiClient.post(`/users/${profile?.uid}/profile-image`, formData);

      if (response.success && response.data?.url) {
        const newUrl = response.data.url;
        setPhotoURL(newUrl);

        if (profile) {
          const updatedProfile = { ...profile, photoURL: newUrl };
          login(updatedProfile);
        }

        showToast("Profile photo updated successfully", "success");
      } else {
        showToast(response.message || "Failed to upload photo", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to upload profile photo", "error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Profile info update handler
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;

    if (!name.trim()) {
      showToast("Name cannot be empty", "error");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      showToast("Please enter a valid email address", "error");
      return;
    }

    if (email !== profile.email) {
      setReauthPendingAction("email");
      setShowReauthModal(true);
      return;
    }

    setUpdatingProfile(true);
    try {
      const response = await apiClient.put(`/users/${profile.uid}`, {
        name,
        email,
        phone,
        address,
      });

      if (response.success) {
        showToast("Profile updated successfully", "success");
        if (profile) {
          const updatedProfile = { ...profile, name, phone, address };
          login(updatedProfile);
        }
      } else {
        showToast(response.message || "Failed to update profile", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Update failed", "error");
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Secure Password Change trigger
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast("Please enter your current password", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }

    setReauthPendingAction("password");
    setShowReauthModal(true);
  };

  // Re-authentication confirmation handler
  const handleReauthenticateConfirm = async () => {
    if (!profile?.uid) return;

    setGlobalLoadingState(true);
    try {
      if (reauthPendingAction === "email") {
        const response = await apiClient.put(`/users/${profile.uid}`, {
          name,
          email,
          phone,
          address,
          currentPassword: reauthPassword,
        });

        if (response.success) {
          showToast("Profile & email updated successfully", "success");
          if (profile) {
            const updatedProfile = { ...profile, name, email, phone, address };
            login(updatedProfile);
          }
          setShowReauthModal(false);
          setReauthPassword("");
          setReauthPendingAction(null);
        } else {
          showToast(response.message || "Failed to update profile", "error");
        }
      } else if (reauthPendingAction === "password") {
        const response = await apiClient.put(`/users/${profile.uid}/password`, {
          currentPassword: reauthPassword,
          newPassword: newPassword,
        });

        if (response.success) {
          showToast("Password updated successfully", "success");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setShowReauthModal(false);
          setReauthPassword("");
          setReauthPendingAction(null);
        } else {
          showToast(response.message || "Incorrect current password", "error");
        }
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Verification failed. Check your password.", "error");
    } finally {
      setGlobalLoadingState(false);
    }
  };

  const setGlobalLoadingState = (loading: boolean) => {
    if (reauthPendingAction === "email") setUpdatingProfile(loading);
    if (reauthPendingAction === "password") setUpdatingPassword(loading);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Profile Settings"
        description="Manage your account profile, delivery contact info, and security credentials."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Avatar Card */}
        <div className="bg-white rounded-lg border border-stone-200 shadow-xs p-6 flex flex-col items-center text-center space-y-4">
          <div className="relative w-24 h-24 rounded-full bg-stone-100 flex items-center justify-center border-2 border-stone-200">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Profile"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl font-semibold text-[#8B1E1E]">
                {profile?.name?.charAt(0).toUpperCase() || "U"}
              </span>
            )}

            <label
              className="absolute bottom-0 right-0 w-8 h-8 bg-stone-900 hover:bg-stone-800 text-white rounded-full flex items-center justify-center cursor-pointer shadow-sm transition-colors border-2 border-white"
              title="Upload photo"
            >
              <Camera size={14} />
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={uploadingPhoto}
              />
            </label>

            {uploadingPhoto && (
              <div className="absolute inset-0 bg-white/90 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-stone-900">{profile?.name}</h3>
            <p className="text-xs text-stone-500 mt-0.5">{profile?.email}</p>
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              <Badge variant="neutral" size="sm">
                {profile?.role}
              </Badge>
              <Badge variant="success" size="sm">
                Active
              </Badge>
            </div>
          </div>
        </div>

        {/* Right Side: Form Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Details */}
          <div className="bg-white rounded-lg border border-stone-200 shadow-xs p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
              <User size={16} className="text-stone-500" />
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Personal Information</h3>
                <p className="text-xs text-stone-500">Update your contact information</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Full Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z\s\-]/g, ""))}
                />

                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Phone Number"
                  type="tel"
                  placeholder="+234..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9\+\-\s]/g, ""))}
                />

                <Input
                  label="Delivery Address"
                  placeholder="Address in Dutse..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={updatingProfile}
                >
                  Save Profile
                </Button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-lg border border-stone-200 shadow-xs p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
              <KeyRound size={16} className="text-stone-500" />
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Security & Password</h3>
                <p className="text-xs text-stone-500">Change your sign-in password</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Current Password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />

                <Input
                  label="New Password"
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="outline"
                  size="md"
                  loading={updatingPassword}
                >
                  Change Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Secure Re-authentication Dialog */}
      {showReauthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl max-w-sm w-full p-6 space-y-4 animate-scale-in">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center mx-auto border border-stone-200 mb-2">
                <Lock size={18} />
              </div>
              <h3 className="text-sm font-semibold text-stone-900">Confirm Current Password</h3>
              <p className="text-xs text-stone-500">
                Please confirm your password to finalize this sensitive update.
              </p>
            </div>

            <Input
              label="Password"
              type="password"
              required
              placeholder="Enter current password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
            />

            <div className="flex gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                fullWidth
                onClick={() => {
                  setShowReauthModal(false);
                  setReauthPassword("");
                  setReauthPendingAction(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={handleReauthenticateConfirm}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
