/**
 * Utility for resolving media and upload URLs across both local dev and production.
 * Ensures relative upload paths (/uploads/...) resolve properly to the backend API origin
 * or dev server proxy.
 */

export function resolveMediaUrl(url?: string | null, fallback = "/queen-logo.png"): string {
  if (!url || typeof url !== "string") {
    return fallback;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return fallback;
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

  // Backend uploads: extract clean origin from VITE_API_URL
  let apiOrigin = "https://api.queenspalaceeatery.com";
  try {
    const rawApi = (import.meta.env.VITE_API_URL as string) || "https://api.queenspalaceeatery.com";
    if (rawApi.startsWith("http://") || rawApi.startsWith("https://")) {
      const parsed = new URL(rawApi);
      apiOrigin = parsed.origin;
    }
  } catch {
    apiOrigin = "https://api.queenspalaceeatery.com";
  }

  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${apiOrigin}${cleanPath}`;
}
