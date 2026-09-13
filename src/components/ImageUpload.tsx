import React, { useState, useEffect } from "react";
import { apiClient } from "../services/apiClient";
import imageCompression from "browser-image-compression";
import { Upload, X, ImageIcon } from "lucide-react";
import { useUI } from "../context/UIContext";
import { resolveMediaUrl } from "../utils/media";

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
  initialImage?: string;
  folder?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ 
  onUploadComplete, 
  initialImage,
  folder = "menu"
}) => {
  const [preview, setPreview] = useState<string | null>(initialImage || null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { showToast } = useUI();

  useEffect(() => {
    setPreview(initialImage || null);
  }, [initialImage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file", "error");
      return;
    }

    try {
      setUploading(true);
      setProgress(20);

      // Compress image
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: false
      };
      
      const compressedFile = await imageCompression(file, options);
      setProgress(50);

      // Update preview immediately
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(compressedFile);

      // Upload to custom upload endpoint (using CMS upload as the shared temp bucket)
      const formData = new FormData();
      formData.append("image", compressedFile, file.name);
      formData.append("folder", folder); // pass destination folder hints if useful

      setProgress(75);
      const response = await apiClient.post("/cms/upload", formData);

      if (response.success && response.data?.url) {
        onUploadComplete(response.data.url);
        showToast("Image uploaded successfully", "success");
      } else {
        showToast(response.message || "Failed to upload image", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to process image", "error");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative group aspect-video bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center transition-all hover:border-primary/50">
        {preview ? (
          <>
            <img src={resolveMediaUrl(preview)} alt="Preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                type="button"
                onClick={() => {
                  setPreview(null);
                  onUploadComplete("");
                }}
                className="bg-white/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-white/40"
              >
                <X size={18} />
              </button>
            </div>
          </>
        ) : (
          <label className="cursor-pointer text-center p-6 space-y-2">
            <div className="w-12 h-12 bg-primary/5 text-primary rounded-xl flex items-center justify-center mx-auto">
              <Upload size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-dark">Upload Image</p>
              <p className="text-[10px] text-gray-400 font-bold mt-1">PNG, JPG, WEBP up to 5MB</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">Uploading {Math.round(progress)}%</p>
          </div>
        )}
      </div>
    </div>
  );
};
