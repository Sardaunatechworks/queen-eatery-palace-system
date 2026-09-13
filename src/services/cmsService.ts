import { apiClient } from "../lib/apiClient";
import type { ApiResponse } from "../types";
import imageCompression from 'browser-image-compression';

export interface CMSHero {
  title: string;
  subtitle: string;
  imageUrl: string;
  additionalImages?: string[];
}

export interface CMSAbout {
  text: string;
  imageUrl: string;
}

export interface CMSService {
  id: string;
  icon: string; // E.g., 'Utensils', 'MessageSquare', 'Calendar'
  title: string;
  description: string;
  imageUrl?: string;
  additionalImages?: string[];
}

export interface CMSEventHall {
  description: string;
  imageUrls: string[];
  additionalImages?: string[];
}

export interface CMSContact {
  phone: string;
  address: string;
}

export interface CMSData {
  hero: CMSHero;
  about: CMSAbout;
  services: CMSService[];
  eventHall: CMSEventHall;
  contact: CMSContact;
}

export const defaultCMSData: CMSData = {
  hero: {
    title: "Simple Food, \nGreat Taste.",
    subtitle: "Experience quality dining and host your special events at The Queen's Palace Eatery and Event Hall. We keep it simple and professional.",
    imageUrl: "",
    additionalImages: []
  },
  about: {
    text: "The Queen's Palace Eatery and Event Hall serves a variety of local and international dishes prepared with care. Our event hall is also open for weddings, meetings, and celebrations in Dutse.",
    imageUrl: "" 
  },
  services: [
    {
      id: "dine-in",
      icon: "Utensils",
      title: "Dine-In",
      description: "Eat comfortably in our well-spaced dining hall with premium service.",
      imageUrl: "",
      additionalImages: []
    },
    {
      id: "fast-orders",
      icon: "MessageSquare",
      title: "Fast Orders",
      description: "Order online and pick it up or get it delivered to your doorstep.",
      imageUrl: "",
      additionalImages: []
    },
    {
      id: "event-hall",
      icon: "Calendar",
      title: "Event Hall",
      description: "Large hall with state-of-the-art facilities for weddings and gatherings.",
      imageUrl: "",
      additionalImages: []
    }
  ],
  eventHall: {
    description: "Our event hall is fully equipped with modern facilities. Perfect for weddings and corporate gatherings.",
    imageUrls: [],
    additionalImages: []
  },
  contact: {
    phone: "+234 813 554 9195",
    address: "Behind Dutse Emirs House, \nOpposite Glo Office, Dutse, Jigawa State"
  }
};

export const getCMSContent = async (): Promise<CMSData> => {
  try {
    const response = await apiClient.get<ApiResponse<CMSData>>("/cms");
    if (response.success && response.data && typeof response.data === "object") {
      const d = response.data;
      return {
        ...defaultCMSData,
        ...d,
        hero: {
          ...defaultCMSData.hero,
          ...(d.hero || {}),
          additionalImages: Array.isArray(d.hero?.additionalImages) ? d.hero.additionalImages : []
        },
        services: Array.isArray(d.services) && d.services.length > 0 ? d.services.map(s => ({
          ...s,
          imageUrl: s.imageUrl ?? "",
          additionalImages: Array.isArray(s.additionalImages) ? s.additionalImages : []
        })) : defaultCMSData.services,
        eventHall: {
          ...defaultCMSData.eventHall,
          ...(d.eventHall || {}),
          imageUrls: Array.isArray(d.eventHall?.imageUrls) && d.eventHall.imageUrls.length > 0 
            ? d.eventHall.imageUrls 
            : defaultCMSData.eventHall.imageUrls,
          additionalImages: Array.isArray(d.eventHall?.additionalImages) ? d.eventHall.additionalImages : []
        }
      };
    }
    return defaultCMSData;
  } catch (error) {
    console.error("CMS Content fetch failed, falling back to default data.", error);
    return defaultCMSData;
  }
};

export const updateCMSContent = async (data: CMSData): Promise<void> => {
  try {
    await apiClient.put("/cms", data);
  } catch (error: any) {
    console.error("Failed to update CMS content:", error);
    throw new Error(error.message || "Failed to update CMS content");
  }
};

export const uploadCMSImage = async (file: File, path: string): Promise<string> => {
  try {
    // Compress the image
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.7
    };
    
    const compressedFile = await imageCompression(file, options);
    
    const formData = new FormData();
    formData.append("image", compressedFile, file.name);
    
    const response = await apiClient.post<ApiResponse<{ url: string }>>("/cms/upload", formData);
    if (response.success && response.data?.url) {
      return response.data.url;
    }
    
    throw new Error(response.message || "Upload failed");
  } catch (error: any) {
    console.error("Error uploading CMS image:", error);
    throw new Error(error.message || "Failed to upload image.");
  }
};
