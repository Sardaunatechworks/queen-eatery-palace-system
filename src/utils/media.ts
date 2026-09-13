/**
 * Utility for resolving media and upload URLs across both local dev and production.
 * Ensures relative upload paths (/uploads/...) resolve properly to the backend API origin
 * or dev server proxy.
 */

export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== "string") {
    return "";
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  // If already absolute or blob/data URI, return as-is
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  // Frontend public static assets (e.g., logo, placeholders)
  if (
    trimmed === "/queen-logo.png" ||
    trimmed === "queen-logo.png" ||
    trimmed.startsWith("/assets/") ||
    trimmed.startsWith("assets/")
  ) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  // Backend uploads: prepend API origin
  const apiBase = (import.meta.env.VITE_API_URL || "https://api.queenspalaceeatery.com").replace(/\/+$/, "");
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (cleanPath.startsWith("/uploads/") || cleanPath.startsWith("/api/")) {
    return `${apiBase}${cleanPath}`;
  }

  return `${apiBase}${cleanPath}`;
}
