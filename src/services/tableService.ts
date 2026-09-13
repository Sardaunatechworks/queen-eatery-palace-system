import { apiClient } from '../lib/apiClient';
import type { ApiResponse, RestaurantTable } from '../types';

export interface CreateTablePayload {
  table_number: string;
  label?: string;
  capacity?: number;
  is_active?: boolean;
}

export interface UpdateTablePayload {
  table_number?: string;
  label?: string;
  capacity?: number;
  is_active?: boolean;
}

export interface TableQrResponse {
  table_id: number;
  table_number: string;
  label: string | null;
  public_token: string;
  qr_url: string;
}

export const getTables = async (): Promise<RestaurantTable[]> => {
  const response = await apiClient.get<ApiResponse<RestaurantTable[]>>('/tables');
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const getTable = async (id: number): Promise<RestaurantTable> => {
  const response = await apiClient.get<ApiResponse<RestaurantTable>>(`/tables/${id}`);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to fetch table');
};

export const createTable = async (data: CreateTablePayload): Promise<RestaurantTable> => {
  const response = await apiClient.post<ApiResponse<RestaurantTable>>('/tables', data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to create table');
};

export const updateTable = async (id: number, data: UpdateTablePayload): Promise<RestaurantTable> => {
  const response = await apiClient.put<ApiResponse<RestaurantTable>>(`/tables/${id}`, data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to update table');
};

export const deleteTable = async (id: number): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<null>>(`/tables/${id}`);
  if (!response.success) {
    throw new Error(response.message || 'Failed to delete table');
  }
};

export const regenerateQrToken = async (id: number): Promise<RestaurantTable> => {
  const response = await apiClient.post<ApiResponse<RestaurantTable>>(`/tables/${id}/regenerate-qr`, {});
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to regenerate QR token');
};

export const getTableQrData = async (id: number): Promise<TableQrResponse> => {
  const response = await apiClient.get<ApiResponse<TableQrResponse>>(`/tables/${id}/qr`);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to fetch table QR data');
};
