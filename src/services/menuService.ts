import { apiClient } from '../lib/apiClient';
import imageCompression from 'browser-image-compression';
import type {
  ApiResponse,
  PaginatedResponse,
  Category,
  CreateCategoryData,
  UpdateCategoryData,
  MenuItem,
  CreateMenuItemData,
  UpdateMenuItemData,
  InventoryItem,
  StockMovement,
  InventorySummaryStats,
} from '../types';

export interface MenuListParams {
  page?: number;
  per_page?: number;
  search?: string;
  category_id?: number;
  status?: string;
  approval_status?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface StockAdjustmentRequest {
  quantity: number;
  movement_type: 'add' | 'deduction' | 'adjustment' | 'stock_in' | 'wastage' | 'damaged' | 'manual_adjust';
  notes?: string;
}

export interface InventoryUpdateRequest {
  quantity: number;
  low_stock_threshold: number;
  notes?: string;
}

// ============================================
// Categories Service
// ============================================

export const getCategories = async (): Promise<Category[]> => {
  const response = await apiClient.get<ApiResponse<Category[]>>('/categories');
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const createCategory = async (data: CreateCategoryData): Promise<Category> => {
  const response = await apiClient.post<ApiResponse<Category>>('/categories', data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to create category');
};

export const updateCategory = async (id: number, data: UpdateCategoryData): Promise<Category> => {
  const response = await apiClient.put<ApiResponse<Category>>(`/categories/${id}`, data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to update category');
};

export const deleteCategory = async (id: number): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<null>>(`/categories/${id}`);
  if (!response.success) {
    throw new Error(response.message || 'Failed to delete category');
  }
};

// ============================================
// Menu Items Service
// ============================================

export const getMenuItems = async (params: MenuListParams = {}): Promise<PaginatedResult<MenuItem>> => {
  const queryParts: string[] = [];
  if (params.page !== undefined) queryParts.push(`page=${encodeURIComponent(params.page)}`);
  if (params.per_page !== undefined) queryParts.push(`per_page=${encodeURIComponent(params.per_page)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.category_id !== undefined && params.category_id !== null) {
    queryParts.push(`category_id=${encodeURIComponent(params.category_id)}`);
  }
  if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.approval_status) queryParts.push(`approval_status=${encodeURIComponent(params.approval_status)}`);

  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get<PaginatedResponse<MenuItem>>(`/menu${queryStr}`);

  if (response.success && response.data) {
    const pagination = response.pagination || {
      total: response.data.length,
      page: params.page || 1,
      per_page: params.per_page || response.data.length,
      total_pages: 1,
    };
    return {
      items: response.data,
      pagination,
    };
  }

  return {
    items: [],
    pagination: { total: 0, page: 1, per_page: 10, total_pages: 0 },
  };
};

export const getMenuItem = async (id: number): Promise<MenuItem> => {
  const response = await apiClient.get<ApiResponse<MenuItem>>(`/menu/${id}`);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to fetch menu item');
};

export const createMenuItem = async (data: CreateMenuItemData): Promise<MenuItem> => {
  const response = await apiClient.post<ApiResponse<MenuItem>>('/menu', data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to create menu item');
};

export const updateMenuItem = async (id: number, data: UpdateMenuItemData): Promise<MenuItem> => {
  const response = await apiClient.put<ApiResponse<MenuItem>>(`/menu/${id}`, data);
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to update menu item');
};

export const deleteMenuItem = async (id: number): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<null>>(`/menu/${id}`);
  if (!response.success) {
    throw new Error(response.message || 'Failed to delete menu item');
  }
};

export const approveMenuItem = async (id: number, status: 'approved' | 'rejected'): Promise<void> => {
  const response = await apiClient.patch<ApiResponse<null>>(`/menu/${id}/approve`, {
    approval_status: status,
  });
  if (!response.success) {
    throw new Error(response.message || 'Failed to update approval status');
  }
};

export const updateMenuItemStock = async (id: number, data: StockAdjustmentRequest): Promise<any> => {
  const response = await apiClient.patch<ApiResponse<any>>(`/menu/${id}/stock`, data);
  if (response.success) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to update stock');
};

export const uploadMenuImage = async (menuItemId: number, file: File): Promise<string> => {
  try {
    const options = {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.75,
    };
    const compressedFile = await imageCompression(file, options);

    const formData = new FormData();
    formData.append('image', compressedFile, file.name);

    const response = await apiClient.post<ApiResponse<{ image_path: string; image_url: string }>>(
      `/menu/${menuItemId}/image`,
      formData
    );

    if (response.success && response.data?.image_url) {
      return response.data.image_url;
    }
    if (response.success && response.data?.image_path) {
      return response.data.image_path;
    }

    throw new Error(response.message || 'Image upload failed');
  } catch (error: any) {
    console.error('Error uploading menu item image:', error);
    throw new Error(error.message || 'Failed to upload menu item image');
  }
};

// ============================================
// Inventory Service
// ============================================

export const getInventory = async (): Promise<InventoryItem[]> => {
  const response = await apiClient.get<ApiResponse<InventoryItem[]>>('/inventory');
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const updateInventory = async (menuItemId: number, data: InventoryUpdateRequest): Promise<void> => {
  const response = await apiClient.put<ApiResponse<null>>(`/inventory/${menuItemId}`, data);
  if (!response.success) {
    throw new Error(response.message || 'Failed to update inventory');
  }
};

export const getLowStockItems = async (): Promise<InventoryItem[]> => {
  const response = await apiClient.get<ApiResponse<InventoryItem[]>>('/inventory/low-stock');
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const getStockHistory = async (menuItemId: number, limit = 50): Promise<StockMovement[]> => {
  const response = await apiClient.get<ApiResponse<StockMovement[]>>(`/inventory/${menuItemId}/history?limit=${limit}`);
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const getInventorySummary = async (): Promise<InventorySummaryStats> => {
  const response = await apiClient.get<ApiResponse<InventorySummaryStats>>('/inventory/summary');
  if (response.success && response.data) {
    return response.data;
  }
  return {
    total_tracked_items: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    movements_today: 0,
    total_valuation: 0,
  };
};

export const getAllStockMovements = async (limit = 100): Promise<StockMovement[]> => {
  const response = await apiClient.get<ApiResponse<StockMovement[]>>(`/inventory/movements?limit=${limit}`);
  if (response.success && response.data) {
    return response.data;
  }
  return [];
};

export const stockInItem = async (menuItemId: number, quantity: number, notes?: string): Promise<any> => {
  const response = await apiClient.post<ApiResponse<any>>(`/inventory/${menuItemId}/stock-in`, {
    quantity,
    notes: notes || 'Restock / Purchase',
  });
  if (response.success) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to add stock');
};

export const recordItemWastage = async (
  menuItemId: number,
  quantity: number,
  notes: string,
  type: 'wastage' | 'damaged' = 'wastage'
): Promise<any> => {
  const response = await apiClient.post<ApiResponse<any>>(`/inventory/${menuItemId}/wastage`, {
    quantity,
    notes,
    type,
  });
  if (response.success) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to record wastage');
};

export const adjustItemStock = async (
  menuItemId: number,
  quantity: number,
  notes: string,
  lowStockThreshold?: number
): Promise<any> => {
  const payload: any = { quantity, notes };
  if (lowStockThreshold !== undefined && lowStockThreshold !== null) {
    payload.low_stock_threshold = lowStockThreshold;
  }
  const response = await apiClient.post<ApiResponse<any>>(`/inventory/${menuItemId}/adjust`, payload);
  if (response.success) {
    return response.data;
  }
  throw new Error(response.message || 'Failed to adjust stock');
};
