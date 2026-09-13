import { apiClient } from '../lib/apiClient';
import type {
  ApiResponse,
  GuestTableInfo,
  GuestMenuResponse,
  GuestOrderSubmission,
  GuestTrackOrder,
} from '../types';

export const validateTable = async (token: string): Promise<GuestTableInfo> => {
  const response = await apiClient.get<ApiResponse<GuestTableInfo>>(`/qr/table/${encodeURIComponent(token)}`);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Invalid or disabled table QR code');
};

export const getGuestMenu = async (token: string): Promise<GuestMenuResponse> => {
  const response = await apiClient.get<ApiResponse<GuestMenuResponse>>(`/qr/menu/${encodeURIComponent(token)}`);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to load restaurant menu');
};

export const submitGuestOrder = async (
  payload: GuestOrderSubmission
): Promise<{
  order_id: number;
  order_number: string;
  guest_access_token: string;
  tracking_url: string;
  total: number;
  payment_timing: string;
}> => {
  const response = await apiClient.post<ApiResponse<any>>('/qr/orders', payload);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to submit table order');
};

export const trackGuestOrder = async (guestToken: string): Promise<GuestTrackOrder> => {
  const response = await apiClient.get<ApiResponse<GuestTrackOrder>>(
    `/qr/orders/track/${encodeURIComponent(guestToken)}`
  );
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to track order');
};

export const cancelGuestOrder = async (guestToken: string): Promise<void> => {
  const response = await apiClient.post<ApiResponse<null>>(
    `/qr/orders/track/${encodeURIComponent(guestToken)}/cancel`,
    {}
  );
  if (!response.success) {
    throw new Error(response.message || 'Failed to cancel order');
  }
};
