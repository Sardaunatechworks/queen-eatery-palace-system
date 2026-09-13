/**
 * Queen's Palace Eatery & Event Hall - Frontend Notification Service
 */

import { apiClient } from '../lib/apiClient';
import type { ApiResponse, PaginatedResponse, Notification } from '../types';

/**
 * Fetch paginated notifications for current user/role.
 */
export async function getNotifications(
  page = 1,
  perPage = 20
): Promise<PaginatedResponse<Notification>> {
  return apiClient.get<PaginatedResponse<Notification>>(
    `/notifications?page=${page}&per_page=${perPage}`
  );
}

/**
 * Get count of unread notifications for badge.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const res = await apiClient.get<ApiResponse<{ count: number }>>(
    '/notifications/unread-count'
  );
  return res.data?.count ?? 0;
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(id: number | string): Promise<void> {
  await apiClient.patch<ApiResponse<null>>(`/notifications/${id}/read`);
}

/**
 * Mark all unread notifications as read.
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  await apiClient.post<ApiResponse<null>>('/notifications/mark-all-read');
}

/**
 * Delete a notification.
 */
export async function deleteNotification(id: number | string): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(`/notifications/${id}`);
}
