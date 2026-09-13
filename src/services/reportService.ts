/**
 * Queen's Palace Eatery & Event Hall - Frontend Report & Analytics Service
 */

import { apiClient, getAccessToken } from '../lib/apiClient';
import type {
  ApiResponse,
  PaginatedResponse,
  DashboardOverviewData,
  SalesReportData,
  OrderMetricsData,
  InventoryReportData,
  CashierPerformanceData,
  Transaction,
} from '../types';

export interface ReportQueryParams {
  period?: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';
  start_date?: string;
  end_date?: string;
}

export interface TransactionQueryParams extends ReportQueryParams {
  page?: number;
  per_page?: number;
  payment_method?: string;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

export interface AdminDashboardData {
  overview: DashboardOverviewData;
  salesTrend: { date: string; total_sales: number; order_count: number }[];
  activeOrders: any[];
  transactions: Transaction[];
}

/**
 * Fetch unified admin dashboard summary in a single optimized request.
 */
export async function getAdminDashboard(): Promise<ApiResponse<AdminDashboardData>> {
  return apiClient.get<ApiResponse<AdminDashboardData>>('/admin/dashboard');
}

/**
 * Fetch overview KPIs for the admin dashboard.
 */
export async function getDashboardOverview(): Promise<ApiResponse<DashboardOverviewData>> {
  return apiClient.get<ApiResponse<DashboardOverviewData>>('/dashboard/overview');
}

/**
 * Fetch detailed sales performance analytics.
 */
export async function getSalesReport(
  params?: ReportQueryParams
): Promise<ApiResponse<SalesReportData>> {
  const query = buildQuery(params as Record<string, string | number | undefined>);
  return apiClient.get<ApiResponse<SalesReportData>>(`/reports/sales${query}`);
}

/**
 * Fetch order workflow metrics and peak hours.
 */
export async function getOrderMetrics(
  params?: ReportQueryParams
): Promise<ApiResponse<OrderMetricsData>> {
  const query = buildQuery(params as Record<string, string | number | undefined>);
  return apiClient.get<ApiResponse<OrderMetricsData>>(`/reports/orders${query}`);
}

/**
 * Fetch inventory stock valuation and low-stock alert items.
 */
export async function getInventoryReport(): Promise<ApiResponse<InventoryReportData>> {
  return apiClient.get<ApiResponse<InventoryReportData>>('/reports/inventory');
}

/**
 * Fetch cashier shift sales and transaction breakdowns.
 */
export async function getCashierPerformance(
  params?: ReportQueryParams
): Promise<ApiResponse<CashierPerformanceData>> {
  const query = buildQuery(params as Record<string, string | number | undefined>);
  return apiClient.get<ApiResponse<CashierPerformanceData>>(`/reports/cashiers${query}`);
}

/**
 * Fetch paginated transaction ledger.
 */
export async function getTransactionLedger(
  params?: TransactionQueryParams
): Promise<PaginatedResponse<Transaction>> {
  const query = buildQuery(params as Record<string, string | number | undefined>);
  return apiClient.get<PaginatedResponse<Transaction>>(`/reports/transactions${query}`);
}

/**
 * Download exported CSV report from the backend.
 */
export async function downloadReportCSV(
  type: 'sales' | 'inventory' | 'transactions',
  startDate?: string,
  endDate?: string
): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.queenspalaceeatery.com';
  const params: Record<string, string | undefined> = { type, start_date: startDate, end_date: endDate };
  const query = buildQuery(params);
  const response = await fetch(`${API_BASE_URL}/api/v2/reports/export${query}`, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to download report');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QEP_${type}_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
