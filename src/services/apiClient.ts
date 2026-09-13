/**
 * Unified API Client
 *
 * Directs all service imports to the centralized V2 API Client in lib/apiClient
 * to maintain a single token state, singleton cache, and automatic refresh interceptor.
 */

export * from '../lib/apiClient';
export { apiClient as default, apiClient } from '../lib/apiClient';
