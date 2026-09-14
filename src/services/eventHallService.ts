/**
 * Queen's Palace Eatery & Event Hall - Frontend Event Hall Service
 */

import { apiClient } from '../lib/apiClient';
import type {
  ApiResponse,
  PaginatedResponse,
  EventHallInquiry,
  CreateEventHallInquiryData,
  UpdateEventHallInquiryStatusData,
  EventHallStatsData,
  EventHallAvailabilityResponse,
} from '../types';

export interface EventHallFilterParams {
  page?: number;
  per_page?: number;
  status?: string;
  event_type?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

/**
 * Get real-time event hall slot availability for a date.
 */
export async function getEventHallAvailability(
  date: string
): Promise<ApiResponse<EventHallAvailabilityResponse>> {
  return apiClient.get<ApiResponse<EventHallAvailabilityResponse>>(
    `/event-hall/availability?date=${encodeURIComponent(date)}`
  );
}

/**
 * Submit public event hall inquiry.
 */
export async function submitEventHallInquiry(
  data: CreateEventHallInquiryData
): Promise<ApiResponse<EventHallInquiry>> {
  return apiClient.post<ApiResponse<EventHallInquiry>>('/event-hall/inquire', data);
}

/**
 * Fetch paginated inquiries for admin/staff.
 */
export async function getEventHallInquiries(
  params?: EventHallFilterParams
): Promise<PaginatedResponse<EventHallInquiry>> {
  const query = buildQuery(params as Record<string, string | number | undefined>);
  return apiClient.get<PaginatedResponse<EventHallInquiry>>(`/event-hall/inquiries${query}`);
}

/**
 * Get aggregate event hall inquiry statistics.
 */
export async function getEventHallStats(): Promise<ApiResponse<EventHallStatsData>> {
  return apiClient.get<ApiResponse<EventHallStatsData>>('/event-hall/inquiries/stats');
}

/**
 * Get single inquiry details by ID.
 */
export async function getEventHallInquiryById(
  id: number
): Promise<ApiResponse<EventHallInquiry>> {
  return apiClient.get<ApiResponse<EventHallInquiry>>(`/event-hall/inquiries/${id}`);
}

/**
 * Update event hall inquiry status and admin notes.
 */
export async function updateEventHallInquiryStatus(
  id: number,
  data: UpdateEventHallInquiryStatusData
): Promise<ApiResponse<EventHallInquiry>> {
  return apiClient.patch<ApiResponse<EventHallInquiry>>(
    `/event-hall/inquiries/${id}/status`,
    data
  );
}

/**
 * Delete an event hall inquiry (Admin only).
 */
export async function deleteEventHallInquiry(id: number): Promise<ApiResponse<null>> {
  return apiClient.delete<ApiResponse<null>>(`/event-hall/inquiries/${id}`);
}
