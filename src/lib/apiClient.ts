/**
 * Queen's Palace Eatery & Event Hall - V2 API Client
 *
 * Secure HTTP client utilizing Secure HttpOnly Cookies for authentication,
 * CSRF double-submit protection, automatic refresh interceptors, request deduplication,
 * and micro-caching for instant navigation.
 *
 * SECURITY: Absolutely zero authentication tokens or credentials are stored
 * in browser localStorage or sessionStorage.
 */

import type { ApiResponse, PaginatedResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.queenspalaceeatery.com';

// Active refresh coordination
let isRefreshing = false;
let refreshSubscribers: ((success: boolean) => void)[] = [];

// Scrub any legacy tokens left over from older versions
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('qep_v2_access_token');
    localStorage.removeItem('qep_v2_refresh_token');
    localStorage.removeItem('qep_access_token');
    localStorage.removeItem('qep_refresh_token');
    sessionStorage.removeItem('qep_access_token');
    sessionStorage.removeItem('qep_refresh_token');
  } catch {
    // Ignore storage access errors in sandboxed environments
  }
}

// Request Cache & In-flight Deduplication
const getCache = new Map<string, { timestamp: number; data: unknown }>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const DEFAULT_GET_TTL_MS = 3000; // 3 seconds micro-cache

function getTtlForEndpoint(endpoint: string): number {
  if (
    endpoint.includes('/categories') ||
    endpoint.includes('/cms') ||
    endpoint.includes('/permissions') ||
    endpoint.includes('/users/me') ||
    endpoint.includes('/auth/profile')
  ) {
    return 60000; // 60s for static metadata
  }
  if (endpoint.includes('/menu') && !endpoint.includes('/stock') && !endpoint.includes('/items/')) {
    return 20000; // 20s for general menu listing
  }
  return DEFAULT_GET_TTL_MS;
}

/**
 * Clear the in-memory API response cache.
 */
export function clearApiCache(): void {
  getCache.clear();
}

/**
 * Extract CSRF token from non-HttpOnly cookie for double-submit header check.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)qep_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Legacy compatibility stub: tokens are now managed exclusively via Secure HttpOnly cookies.
 */
export function setTokens(_access?: string, _refresh?: string): void {
  // No-op for security: tokens are stored exclusively in HttpOnly cookies
  clearApiCache();
}

/**
 * Clear client cache and wipe legacy storage.
 */
export function clearTokens(): void {
  clearApiCache();
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('qep_v2_access_token');
      localStorage.removeItem('qep_v2_refresh_token');
      localStorage.removeItem('qep_refresh_token');
    } catch {}
  }
}

/**
 * Access token is now HttpOnly and inaccessible to JavaScript.
 */
export function getAccessToken(): string | null {
  return null;
}

/**
 * Refresh token is now HttpOnly and inaccessible to JavaScript.
 */
export function getRefreshToken(): string | null {
  return null;
}

function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

/**
 * Trigger backend token refresh using HttpOnly refresh cookie.
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      clearApiCache();
      return false;
    }

    const resData = await response.json();
    return !!resData.success;
  } catch {
    clearApiCache();
    return false;
  }
}

/**
 * Core request function with HttpOnly cookie credentials, CSRF, caching, and deduplication.
 */
async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const cacheKey = `${options.method || 'GET'}:${endpoint}`;

  // Serve from micro-cache if fresh
  if (isGet) {
    const cached = getCache.get(cacheKey);
    const ttl = getTtlForEndpoint(endpoint);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }

    // Deduplicate in-flight GET requests
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey) as Promise<T>;
    }
  } else {
    clearApiCache();
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}/api/v2${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Enforce CSRF protection headers for all requests
  headers.set('X-Requested-With', 'XMLHttpRequest');
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  // Ensure cookies are always transmitted
  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers,
  };

  const fetchPromise = (async (): Promise<T> => {
    try {
      const response = await fetch(url, config);

      // Handle 401 with automatic cookie refresh
      if (
        response.status === 401 &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/refresh') &&
        !endpoint.includes('/auth/logout')
      ) {
        if (!isRefreshing) {
          isRefreshing = true;
          const refreshSuccess = await refreshAccessToken();
          isRefreshing = false;

          onRefreshed(refreshSuccess);

          if (!refreshSuccess) {
            throw new Error('Session expired. Please log in again.');
          }
        } else {
          // Await current refresh in-flight
          const success = await new Promise<boolean>((resolve) => {
            subscribeTokenRefresh(resolve);
          });
          if (!success) {
            throw new Error('Session expired. Please log in again.');
          }
        }

        // Retry original request with newly refreshed HttpOnly cookies
        const retryHeaders = new Headers(options.headers || {});
        if (!retryHeaders.has('Content-Type') && !(options.body instanceof FormData)) {
          retryHeaders.set('Content-Type', 'application/json');
        }
        retryHeaders.set('X-Requested-With', 'XMLHttpRequest');
        const refreshedCsrf = getCsrfToken();
        if (refreshedCsrf) {
          retryHeaders.set('X-CSRF-Token', refreshedCsrf);
        }

        const retryResponse = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: retryHeaders,
        });

        if (!retryResponse.ok) {
          const errData = await retryResponse.json().catch(() => ({}));
          const retryErr: any = new Error(errData.message || `Request failed with status ${retryResponse.status}`);
          retryErr.status = retryResponse.status;
          retryErr.data = errData;
          throw retryErr;
        }

        return (await retryResponse.json()) as T;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const err: any = new Error(data.message || `Request failed with status ${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      if (isGet && response.ok) {
        getCache.set(cacheKey, { timestamp: Date.now(), data });
      }

      return data as T;
    } catch (error) {
      throw error;
    } finally {
      if (isGet) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (isGet) {
    inFlightRequests.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
}

export const apiClient = {
  get: <T = any>(endpoint: string, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  put: <T = any>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  patch: <T = any>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  upload: <T = any>(endpoint: string, formData: FormData, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    }),

  paginated: <T = any>(endpoint: string, options?: RequestInit): Promise<PaginatedResponse<T>> =>
    request<PaginatedResponse<T>>(endpoint, { ...options, method: 'GET' }),
};

export default apiClient;
