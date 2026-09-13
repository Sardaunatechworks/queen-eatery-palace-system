import React, { useState, useEffect } from "react";
import { 
  Save, 
  Image as ImageIcon, 
  Layout, 
  Phone, 
  Info, 
  Calendar,
  Loader2,
  Plus,
  Trash2,
  X,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Upload
} from "lucide-react";
import { getCMSContent, updateCMSContent, uploadCMSImage, CMSData, CMSService } from "../../services/cmsService";
import { useUI } from "../../context/UIContext";
import { resolveMediaUrl } from "../../utils/media";

export const CMSManagement: React.FC = () => {
  const { showToast } = useUI();
  const [cmsData, setCmsData] = useState<CMSData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hero");

  // Lightbox Image Preview Modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Active uploading slot identifier
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  useEffect(() => {
    const fetchCMS = async () => {
      try {
        const data = await getCMSContent();
        setCmsData(data);
      } catch (error) {
        showToast("Failed to load CMS content", "error");
      } finally {
        setIsLoading(false);
      }
    };
    fetchCMS();
  }, [showToast]);

  // Handle ESC key to close preview modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSave = async () => {
    if (!cmsData) return;
    setIsSaving(true);
    try {
      await updateCMSContent(cmsData);
      showToast("Content updated successfully", "success");
    } catch (error) {
      showToast("Failed to update content", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slotKey: string,
    path: string,
    callback: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file", "error");
      return;
    }

    // Immediately create local preview so user sees the image without waiting
    const localUrl = URL.createObjectURL(file);
    callback(localUrl);

    setUploadingSlot(slotKey);
    showToast("Compressing and uploading image...", "info");

    try {
      const serverUrl = await uploadCMSImage(file, path);
      callback(serverUrl);
      showToast("Image uploaded successfully", "success");
    } catch (error: any) {
      showToast(error.message || "Upload failed", "error");
    } finally {
      setUploadingSlot(null);
      e.target.value = "";
    }
  };

  const tabs = [
    { id: "hero", label: "Hero Section", icon: Layout },
    { id: "about", label: "About Section", icon: Info },
    { id: "services", label: "Services", icon: Layout },
    { id: "event-hall", label: "Event Hall", icon: Calendar },
    { id: "contact", label: "Contact", icon: Phone },
  ];

  if (isLoading || !cmsData) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-red-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CMS Management</h2>
          <p className="text-gray-500">Manage your landing page content dynamically</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          Save All Changes
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-gray-50 border-r border-gray-100 p-4 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-red-600 shadow-sm border border-gray-100"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-8">
          
          {/* HERO SECTION */}
          {activeTab === "hero" && (
            <div className="space-y-6 animate-in fade-in">
              <h3 className="text-xl font-bold border-b pb-4">Hero Settings</h3>
              <div className="grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title (Use \n for line break)</label>
                  <textarea
                    value={cmsData.hero.title}
                    onChange={(e) => setCmsData({ ...cmsData, hero: { ...cmsData.hero, title: e.target.value } })}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
                  <textarea
                    value={cmsData.hero.subtitle}
                    onChange={(e) => setCmsData({ ...cmsData, hero: { ...cmsData.hero, subtitle: e.target.value } })}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Background Image</label>
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <div className="relative group w-52 h-36 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs shrink-0 flex items-center justify-center">
                      {cmsData.hero.imageUrl ? (
                        <>
                          <img 
                            src={resolveMediaUrl(cmsData.hero.imageUrl)} 
                            alt="Hero Background" 
                            className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.hero.imageUrl, title: "Hero Background Image" })}
                          />
                          <div 
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.hero.imageUrl, title: "Hero Background Image" })}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          >
                            <span className="bg-white/90 text-gray-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                              <Eye size={13} />
                              Preview Full
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-3 text-gray-400">
                          <ImageIcon size={24} className="mx-auto mb-1 opacity-50" />
                          <span className="text-xs block">No Image</span>
                        </div>
                      )}

                      {uploadingSlot === "hero-primary" && (
                        <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-2 z-10">
                          <Loader2 size={24} className="animate-spin text-red-600 mb-1" />
                          <span className="text-[11px] font-bold text-red-600">Uploading...</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {cmsData.hero.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.hero.imageUrl, title: "Hero Background Image" })}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Eye size={14} />
                            Preview Image
                          </button>
                        )}
                        <label className="flex items-center gap-1.5 cursor-pointer bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                          <Upload size={14} />
                          {cmsData.hero.imageUrl ? "Replace Image" : "Upload Image"}
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleImageUpload(e, 'hero-primary', 'hero', (url) => setCmsData({ ...cmsData, hero: { ...cmsData.hero, imageUrl: url } }))}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">Main background atmosphere. Recommended: 1920x1080px (PNG, JPG, WEBP)</p>
                    </div>
                  </div>
                </div>

                {/* Additional Hero Images Spaces */}
                <div className="pt-6 border-t border-gray-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Optional Additional Hero Images</h4>
                      <p className="text-xs text-gray-500">Add extra showcase photos to feature in the hero section</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const current = cmsData.hero.additionalImages || [];
                        setCmsData({
                          ...cmsData,
                          hero: {
                            ...cmsData.hero,
                            additionalImages: [...current, ""]
                          }
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
                    >
                      <Plus size={14} />
                      Add Hero Image Space
                    </button>
                  </div>

                  {(!cmsData.hero.additionalImages || cmsData.hero.additionalImages.length === 0) ? (
                    <div className="p-6 border border-dashed border-gray-200 rounded-xl text-center bg-gray-50/50">
                      <ImageIcon size={28} className="mx-auto mb-1 text-gray-300" />
                      <p className="text-xs text-gray-500 font-medium">No additional hero images added.</p>
                      <p className="text-[11px] text-gray-400">Click &quot;Add Hero Image Space&quot; above to add optional photo slots.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {cmsData.hero.additionalImages.map((imgUrl, idx) => (
                        <div key={idx} className="p-3 border border-gray-200 rounded-xl bg-gray-50/60 space-y-2.5 relative">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                            <span>Image Slot {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...(cmsData.hero.additionalImages || [])];
                                next.splice(idx, 1);
                                setCmsData({
                                  ...cmsData,
                                  hero: { ...cmsData.hero, additionalImages: next }
                                });
                              }}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                              title="Delete image space"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="relative group w-full h-36 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                            {imgUrl ? (
                              <>
                                <img 
                                  src={resolveMediaUrl(imgUrl)} 
                                  alt={`Hero slot ${idx + 1}`} 
                                  className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                                  onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Additional Hero Image (Slot ${idx + 1})` })}
                                />
                                <div
                                  onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Additional Hero Image (Slot ${idx + 1})` })}
                                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                >
                                  <span className="bg-white/90 text-gray-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                                    <Eye size={13} />
                                    Preview Full
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-center p-2 text-gray-400">
                                <ImageIcon size={20} className="mx-auto mb-1 opacity-50" />
                                <span className="text-[11px] block font-medium">Empty Image Space</span>
                              </div>
                            )}

                            {uploadingSlot === `hero-extra-${idx}` && (
                              <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-2 z-10">
                                <Loader2 size={22} className="animate-spin text-red-600 mb-1" />
                                <span className="text-[11px] font-bold text-red-600">Uploading...</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {imgUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Additional Hero Image (Slot ${idx + 1})` })}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
                                title="Preview image"
                              >
                                <Eye size={13} />
                                Preview
                              </button>
                            )}
                            <label className="flex-1 flex items-center justify-center gap-1.5 cursor-pointer bg-white hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 transition-colors shadow-2xs">
                              <Upload size={13} />
                              {imgUrl ? "Replace" : "Upload Image"}
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleImageUpload(e, `hero-extra-${idx}`, 'hero-extra', (url) => {
                                  const next = [...(cmsData.hero.additionalImages || [])];
                                  next[idx] = url;
                                  setCmsData({
                                    ...cmsData,
                                    hero: { ...cmsData.hero, additionalImages: next }
                                  });
                                })}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABOUT SECTION */}
          {activeTab === "about" && (
            <div className="space-y-6 animate-in fade-in">
              <h3 className="text-xl font-bold border-b pb-4">About Settings</h3>
              <div className="grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">About Text</label>
                  <textarea
                    value={cmsData.about.text}
                    onChange={(e) => setCmsData({ ...cmsData, about: { ...cmsData.about, text: e.target.value } })}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    rows={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">About Image</label>
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <div className="relative group w-48 h-48 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs shrink-0 flex items-center justify-center">
                      {cmsData.about.imageUrl ? (
                        <>
                          <img 
                            src={resolveMediaUrl(cmsData.about.imageUrl)} 
                            alt="About" 
                            className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.about.imageUrl, title: "About Section Image" })}
                          />
                          <div
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.about.imageUrl, title: "About Section Image" })}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          >
                            <span className="bg-white/90 text-gray-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                              <Eye size={13} />
                              Preview Full
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-3 text-gray-400">
                          <ImageIcon size={24} className="mx-auto mb-1 opacity-50" />
                          <span className="text-xs block">No Image</span>
                        </div>
                      )}

                      {uploadingSlot === "about" && (
                        <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-2 z-10">
                          <Loader2 size={24} className="animate-spin text-red-600 mb-1" />
                          <span className="text-[11px] font-bold text-red-600">Uploading...</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {cmsData.about.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewModal({ isOpen: true, url: cmsData.about.imageUrl, title: "About Section Image" })}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Eye size={14} />
                            Preview Image
                          </button>
                        )}
                        <label className="flex items-center gap-1.5 cursor-pointer bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                          <Upload size={14} />
                          {cmsData.about.imageUrl ? "Replace Image" : "Upload Image"}
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleImageUpload(e, 'about', 'about', (url) => setCmsData({ ...cmsData, about: { ...cmsData.about, imageUrl: url } }))}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">Recommended size: 800x800px (Square aspect ratio)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SERVICES SECTION */}
          {activeTab === "services" && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Additional Services Settings</h3>
                  <p className="text-xs text-gray-500">Configure service offerings and add optional image spaces for each service</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newService: CMSService = {
                      id: `service-${Date.now()}`,
                      icon: "Sparkles",
                      title: "New Service",
                      description: "Description of your service...",
                      imageUrl: "",
                      additionalImages: []
                    };
                    setCmsData({ ...cmsData, services: [...cmsData.services, newService] });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors self-start sm:self-auto"
                >
                  <Plus size={15} />
                  Add Additional Service
                </button>
              </div>

              <div className="space-y-6">
                {cmsData.services.map((service, index) => (
                  <div key={service.id || index} className="p-6 border border-gray-200 rounded-2xl bg-gray-50/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold flex items-center gap-2 text-gray-900 text-sm">
                        <Layout size={18} className="text-red-500" />
                        Service {index + 1}: {service.title || "Untitled"}
                      </h4>
                      {cmsData.services.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newServices = cmsData.services.filter((_, i) => i !== index);
                            setCmsData({ ...cmsData, services: newServices });
                          }}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 text-xs font-semibold"
                          title="Remove this service"
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Service Title</label>
                          <input
                            type="text"
                            value={service.title}
                            onChange={(e) => {
                              const newServices = [...cmsData.services];
                              newServices[index].title = e.target.value;
                              setCmsData({ ...cmsData, services: newServices });
                            }}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Lucide Icon Name (e.g. Utensils, MessageSquare, Calendar, Sparkles)</label>
                          <input
                            type="text"
                            value={service.icon}
                            onChange={(e) => {
                              const newServices = [...cmsData.services];
                              newServices[index].icon = e.target.value;
                              setCmsData({ ...cmsData, services: newServices });
                            }}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
                        <textarea
                          value={service.description}
                          onChange={(e) => {
                            const newServices = [...cmsData.services];
                            newServices[index].description = e.target.value;
                            setCmsData({ ...cmsData, services: newServices });
                          }}
                          className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm"
                          rows={2}
                        />
                      </div>

                      {/* Service Image Space (Optional) */}
                      <div className="pt-2 border-t border-gray-100">
                        <label className="block text-xs font-semibold text-gray-700 mb-2">Optional Service Image Space</label>
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                          <div className="relative group w-40 h-28 rounded-xl border border-gray-200 overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-2xs">
                            {service.imageUrl ? (
                              <>
                                <img 
                                  src={resolveMediaUrl(service.imageUrl)} 
                                  alt={service.title} 
                                  className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                                  onClick={() => setPreviewModal({ isOpen: true, url: service.imageUrl, title: `${service.title || 'Service'} Banner Image` })}
                                />
                                <div
                                  onClick={() => setPreviewModal({ isOpen: true, url: service.imageUrl, title: `${service.title || 'Service'} Banner Image` })}
                                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                >
                                  <span className="bg-white/90 text-gray-900 text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                                    <Eye size={12} />
                                    Preview
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-center p-2 text-gray-400">
                                <ImageIcon size={20} className="mx-auto mb-0.5 opacity-40" />
                                <span className="text-[10px] block">No Photo Added</span>
                              </div>
                            )}

                            {uploadingSlot === `service-${index}` && (
                              <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-2 z-10">
                                <Loader2 size={20} className="animate-spin text-red-600 mb-1" />
                                <span className="text-[10px] font-bold text-red-600">Uploading...</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {service.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewModal({ isOpen: true, url: service.imageUrl, title: `${service.title || 'Service'} Banner Image` })}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
                                >
                                  <Eye size={13} />
                                  Preview
                                </button>
                              )}
                              <label className="flex items-center gap-1.5 cursor-pointer bg-white hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 transition-colors shadow-2xs">
                                <Upload size={13} />
                                {service.imageUrl ? "Replace Image" : "Upload Service Image"}
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleImageUpload(e, `service-${index}`, `service-${index}`, (url) => {
                                    const newServices = [...cmsData.services];
                                    newServices[index] = { ...newServices[index], imageUrl: url };
                                    setCmsData({ ...cmsData, services: newServices });
                                  })}
                                />
                              </label>
                              {service.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newServices = [...cmsData.services];
                                    newServices[index] = { ...newServices[index], imageUrl: "" };
                                    setCmsData({ ...cmsData, services: newServices });
                                  }}
                                  className="text-xs text-red-600 hover:text-red-700 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg font-semibold transition-colors"
                                >
                                  Remove Photo
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500">Adds an illustrative banner image above this service card on the landing page</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EVENT HALL SECTION */}
          {activeTab === "event-hall" && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Event Hall Settings</h3>
                  <p className="text-xs text-gray-500">Manage venue details and configure dynamic image spaces</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...cmsData.eventHall.imageUrls, ""];
                    setCmsData({
                      ...cmsData,
                      eventHall: { ...cmsData.eventHall, imageUrls: next }
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors self-start sm:self-auto"
                >
                  <Plus size={15} />
                  Add Event Hall Image Space
                </button>
              </div>

              <div className="grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={cmsData.eventHall.description}
                    onChange={(e) => setCmsData({ ...cmsData, eventHall: { ...cmsData.eventHall, description: e.target.value } })}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    rows={4}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Event Hall Image Spaces ({cmsData.eventHall.imageUrls.length} {cmsData.eventHall.imageUrls.length === 1 ? 'space' : 'spaces'})
                    </label>
                    <span className="text-xs text-gray-500">Images are showcased dynamically on the public landing page</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {cmsData.eventHall.imageUrls.map((imgUrl, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-xl bg-gray-50/60 space-y-3 relative">
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                          <span>Image Space {index + 1}</span>
                          {cmsData.eventHall.imageUrls.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newUrls = cmsData.eventHall.imageUrls.filter((_, i) => i !== index);
                                setCmsData({
                                  ...cmsData,
                                  eventHall: { ...cmsData.eventHall, imageUrls: newUrls }
                                });
                              }}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                              title="Delete image space"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="relative group w-full h-44 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                          {imgUrl ? (
                            <>
                              <img 
                                src={resolveMediaUrl(imgUrl)} 
                                alt={`Event Hall ${index + 1}`} 
                                className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                                onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Event Hall Image (Space ${index + 1})` })}
                              />
                              <div
                                onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Event Hall Image (Space ${index + 1})` })}
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                              >
                                <span className="bg-white/90 text-gray-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                                  <Eye size={13} />
                                  Preview Full
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-2 text-gray-400">
                              <ImageIcon size={22} className="mx-auto mb-1 opacity-50" />
                              <span className="text-xs block font-medium">Empty Image Space</span>
                            </div>
                          )}

                          {uploadingSlot === `event-${index}` && (
                            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-2 z-10">
                              <Loader2 size={24} className="animate-spin text-red-600 mb-1" />
                              <span className="text-xs font-bold text-red-600">Uploading...</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {imgUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewModal({ isOpen: true, url: imgUrl, title: `Event Hall Image (Space ${index + 1})` })}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition-colors shadow-2xs"
                              title="Preview full size"
                            >
                              <Eye size={13} />
                              Preview
                            </button>
                          )}
                          <label className="flex-1 flex justify-center items-center gap-1.5 cursor-pointer bg-white hover:bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 transition-colors shadow-2xs">
                            <Upload size={13} />
                            {imgUrl ? "Replace Image" : "Upload Image"}
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleImageUpload(e, `event-${index}`, `event-${index}`, (url) => {
                                const newUrls = [...cmsData.eventHall.imageUrls];
                                newUrls[index] = url;
                                setCmsData({ ...cmsData, eventHall: { ...cmsData.eventHall, imageUrls: newUrls } });
                              })}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CONTACT SECTION */}
          {activeTab === "contact" && (
            <div className="space-y-6 animate-in fade-in">
              <h3 className="text-xl font-bold border-b pb-4">Contact Settings</h3>
              <div className="grid gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="text"
                    value={cmsData.contact.phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9+\-\s()]/g, '');
                      setCmsData({ ...cmsData, contact: { ...cmsData.contact, phone: val } });
                    }}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address (Use \n for line break)</label>
                  <textarea
                    value={cmsData.contact.address}
                    onChange={(e) => setCmsData({ ...cmsData, contact: { ...cmsData.contact, address: e.target.value } })}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewModal && previewModal.isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewModal(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <ImageIcon size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">{previewModal.title}</h3>
                  <p className="text-xs text-gray-500 truncate max-w-xs sm:max-w-md font-mono">{previewModal.url}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fullUrl = resolveMediaUrl(previewModal.url);
                    navigator.clipboard.writeText(fullUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    showToast("Image link copied to clipboard", "success");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-2xs"
                  title="Copy full URL"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
                </button>

                <a
                  href={resolveMediaUrl(previewModal.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-2xs"
                  title="Open in new tab"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">Open Original</span>
                </a>

                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-1"
                  title="Close preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body - High Res Viewport */}
            <div className="p-6 overflow-auto flex-1 flex items-center justify-center bg-stone-950/95 min-h-[320px]">
              <img
                src={resolveMediaUrl(previewModal.url)}
                alt={previewModal.title}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-md"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
              <span>Click outside or press Esc to close</span>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
