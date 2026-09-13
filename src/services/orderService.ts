import { apiClient } from '../lib/apiClient';
import type {
  ApiResponse,
  PaginatedResponse,
  Order,
  CreateOrderData,
  PaymentVerificationData,
  Transaction,
} from '../types';

export interface OrderListParams {
  page?: number;
  per_page?: number;
  limit?: number;
  search?: string;
  order_status?: string;
  payment_status?: string;
  order_type?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
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

export interface TransactionListParams {
  page?: number;
  per_page?: number;
  limit?: number;
  search?: string;
  payment_method?: string;
  payment_status?: string;
  date_from?: string;
  date_to?: string;
}

/**
 * Normalizes order records returned from backend for frontend display.
 */
export function normalizeOrder(order: any): Order {
  const normalizedStatus = order.order_status || order.status || 'pending';
  const resolvedCustomer = order.guest_name || order.customer_name || order.customer_user_name || order.customerName || (order.table_number ? `Guest (${order.table_number})` : 'Counter Customer');
  const resolvedOrderNumber = order.order_number || order.orderNumber || order.orderId || (order.id ? `#${order.id}` : 'Order');

  return {
    ...order,
    id: Number(order.id),
    orderId: resolvedOrderNumber,
    orderNumber: resolvedOrderNumber,
    order_number: resolvedOrderNumber,
    table_id: order.table_id ? Number(order.table_id) : undefined,
    table_number: order.table_number || order.rt_table_number || undefined,
    guest_name: order.guest_name || undefined,
    payment_timing: order.payment_timing || undefined,
    guest_access_token: order.guest_access_token || undefined,
    source: order.source || 'customer',
    total_amount: Number(order.total ?? order.total_amount ?? 0),
    total: Number(order.total ?? order.total_amount ?? 0),
    subtotal: Number(order.subtotal ?? 0),
    packaging_quantity: Number(order.packaging_quantity ?? 0),
    packaging_unit_price: Number(order.packaging_unit_price ?? 0),
    packaging_fee: Number(order.packaging_fee ?? 0),
    status: normalizedStatus,
    order_status: normalizedStatus,
    paymentStatus: order.payment_status || order.paymentStatus || 'pending',
    payment_status: order.payment_status || order.paymentStatus || 'pending',
    paymentMethod: order.payment_method || order.paymentMethod,
    payment_method: order.payment_method || order.paymentMethod,
    deliveryType: order.order_type || order.deliveryType || 'pickup',
    address: order.delivery_address || order.address,
    customerName: resolvedCustomer,
    customer_name: resolvedCustomer,
    createdAt: {
      toDate: () => new Date((order.created_at || new Date().toISOString()).replace(/-/g, '/')),
      toMillis: () => new Date((order.created_at || new Date().toISOString()).replace(/-/g, '/')).getTime(),
    },
  };
}

// ============================================
// Orders Service
// ============================================

export const getOrders = async (params: OrderListParams = {}): Promise<PaginatedResult<Order>> => {
  const queryParts: string[] = [];
  if (params.page !== undefined) queryParts.push(`page=${encodeURIComponent(params.page)}`);
  const perPage = params.per_page || params.limit;
  if (perPage !== undefined) queryParts.push(`per_page=${encodeURIComponent(perPage)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.order_status) queryParts.push(`order_status=${encodeURIComponent(params.order_status)}`);
  if (params.payment_status) queryParts.push(`payment_status=${encodeURIComponent(params.payment_status)}`);
  if (params.order_type) queryParts.push(`order_type=${encodeURIComponent(params.order_type)}`);
  if (params.source) queryParts.push(`source=${encodeURIComponent(params.source)}`);
  if (params.date_from) queryParts.push(`date_from=${encodeURIComponent(params.date_from)}`);
  if (params.date_to) queryParts.push(`date_to=${encodeURIComponent(params.date_to)}`);

  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get<PaginatedResponse<Order>>(`/orders${queryStr}`);

  if (response.success && response.data) {
    const items = response.data.map(normalizeOrder);
    const pagination = response.pagination || {
      total: items.length,
      page: params.page || 1,
      per_page: perPage || items.length,
      total_pages: 1,
    };
    return { items, pagination };
  }

  return {
    items: [],
    pagination: { total: 0, page: 1, per_page: 10, total_pages: 0 },
  };
};

export const getMyOrders = async (params: { page?: number; limit?: number } = {}): Promise<PaginatedResult<Order>> => {
  const queryParts: string[] = [];
  if (params.page !== undefined) queryParts.push(`page=${encodeURIComponent(params.page)}`);
  if (params.limit !== undefined) queryParts.push(`per_page=${encodeURIComponent(params.limit)}`);

  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get<PaginatedResponse<Order>>(`/orders/my-orders${queryStr}`);

  if (response.success && response.data) {
    const items = response.data.map(normalizeOrder);
    const pagination = response.pagination || {
      total: items.length,
      page: params.page || 1,
      per_page: params.limit || items.length,
      total_pages: 1,
    };
    return { items, pagination };
  }

  return {
    items: [],
    pagination: { total: 0, page: 1, per_page: 10, total_pages: 0 },
  };
};

export const getActiveOrders = async (): Promise<Order[]> => {
  const response = await apiClient.get<ApiResponse<Order[]>>('/orders/active');
  if (response.success && response.data) {
    return response.data.map(normalizeOrder);
  }
  return [];
};

export const getOrder = async (id: number): Promise<Order> => {
  const response = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`);
  if (response.success && response.data) {
    return normalizeOrder(response.data);
  }
  throw new Error(response.message || 'Failed to fetch order');
};

export const createOrder = async (
  data: CreateOrderData
): Promise<{
  id: number;
  orderNumber: string;
  total: number;
  status: string;
  paymentStatus: string;
}> => {
  const response = await apiClient.post<ApiResponse<any>>('/orders', data);
  if (response.success && response.data) {
    return {
      id: Number(response.data.id),
      orderNumber: response.data.order_number || response.data.orderNumber,
      total: Number(response.data.total ?? response.data.total_amount ?? 0),
      status: response.data.order_status || response.data.status || 'pending',
      paymentStatus: response.data.payment_status || 'pending',
    };
  }
  throw new Error(response.message || 'Failed to place order');
};

export const updateOrderStatus = async (id: number, status: string): Promise<void> => {
  const response = await apiClient.patch<ApiResponse<null>>(`/orders/${id}/status`, { status });
  if (!response.success) {
    throw new Error(response.message || 'Failed to update order status');
  }
};

export const acceptOrder = async (id: number): Promise<void> => {
  const response = await apiClient.post<ApiResponse<any>>(`/orders/${id}/accept`, {});
  if (!response.success) {
    throw new Error(response.message || 'Failed to accept order');
  }
};

export const rejectOrder = async (id: number, reason: string): Promise<void> => {
  const response = await apiClient.post<ApiResponse<any>>(`/orders/${id}/reject`, { reason });
  if (!response.success) {
    throw new Error(response.message || 'Failed to reject order');
  }
};

export const markOrderServed = async (id: number): Promise<void> => {
  const response = await apiClient.post<ApiResponse<any>>(`/orders/${id}/served`, {});
  if (!response.success) {
    throw new Error(response.message || 'Failed to mark order as served');
  }
};

export const recordOrderPayment = async (
  id: number,
  data: { payment_method: string; amount?: number; reference?: string }
): Promise<void> => {
  const response = await apiClient.post<ApiResponse<any>>(`/orders/${id}/payment`, data);
  if (!response.success) {
    throw new Error(response.message || 'Failed to record payment');
  }
};

export const deleteOrder = async (id: number): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<null>>(`/orders/${id}`);
  if (!response.success) {
    throw new Error(response.message || 'Failed to delete order');
  }
};

// ============================================
// Payments & Transactions Service
// ============================================

export const verifyPayment = async (
  data: PaymentVerificationData
): Promise<{
  order_id: string;
  payment_status: string;
  order_status: string;
}> => {
  const response = await apiClient.post<ApiResponse<any>>('/payments/verify', data);
  if (response.success && response.data) {
    return {
      order_id: String(response.data.order_id),
      payment_status: response.data.payment_status,
      order_status: response.data.order_status,
    };
  }
  throw new Error(response.message || 'Payment verification failed');
};

export const getTransactions = async (
  params: TransactionListParams = {}
): Promise<PaginatedResult<Transaction>> => {
  const queryParts: string[] = [];
  if (params.page !== undefined) queryParts.push(`page=${encodeURIComponent(params.page)}`);
  const perPage = params.per_page || params.limit;
  if (perPage !== undefined) queryParts.push(`per_page=${encodeURIComponent(perPage)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.payment_method) queryParts.push(`payment_method=${encodeURIComponent(params.payment_method)}`);
  if (params.payment_status) queryParts.push(`payment_status=${encodeURIComponent(params.payment_status)}`);
  if (params.date_from) queryParts.push(`date_from=${encodeURIComponent(params.date_from)}`);
  if (params.date_to) queryParts.push(`date_to=${encodeURIComponent(params.date_to)}`);

  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get<PaginatedResponse<Transaction>>(`/payments/transactions${queryStr}`);

  if (response.success && response.data) {
    return {
      items: response.data,
      pagination: response.pagination || {
        total: response.data.length,
        page: params.page || 1,
        per_page: perPage || response.data.length,
        total_pages: 1,
      },
    };
  }

  return {
    items: [],
    pagination: { total: 0, page: 1, per_page: 10, total_pages: 0 },
  };
};

export interface CashierDashboardSummary {
  new_online: number;
  new_qr: number;
  new_total: number;
  accepted: number;
  preparing: number;
  ready: number;
  served: number;
  completed_today: number;
}

export const getCashierDashboardSummary = async (): Promise<CashierDashboardSummary> => {
  const response = await apiClient.get<ApiResponse<CashierDashboardSummary>>('/cashier/dashboard-summary');
  if (response.success && response.data) {
    return response.data;
  }
  return {
    new_online: 0,
    new_qr: 0,
    new_total: 0,
    accepted: 0,
    preparing: 0,
    ready: 0,
    served: 0,
    completed_today: 0,
  };
};
