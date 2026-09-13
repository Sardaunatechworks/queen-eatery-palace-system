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

  // Get configured API base URL from Vite environment
  const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (apiBase) {
    return `${apiBase}${cleanPath}`;
  }

  return cleanPath;
}
