<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Notification Controller
 *
 * Handles listing, read-state toggling, and deletion of in-app notifications.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Sanitizer;
use App\Middleware\AuthMiddleware;
use App\Repositories\NotificationRepository;

class NotificationController
{
    /**
     * Get paginated notifications for the authenticated user/role.
     * GET /api/v2/notifications
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $page = max(1, Sanitizer::int($_GET['page'] ?? 1));
        $perPage = min(50, max(1, Sanitizer::int($_GET['per_page'] ?? 20)));

        $result = NotificationRepository::getForUser((int) $user['id'], $user['role_name'], $page, $perPage);

        Response::paginated(
            $result['data'],
            $result['total'],
            $page,
            $perPage
        );
    }

    /**
     * Get count of unread notifications.
     * GET /api/v2/notifications/unread-count
     */
    public function unreadCount(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $count = NotificationRepository::getUnreadCount((int) $user['id'], $user['role_name']);

        Response::success(['count' => $count]);
    }

    /**
     * Mark a single notification as read.
     * PATCH /api/v2/notifications/{id}/read
     */
    public function markAsRead(array $params): void
    {
        AuthMiddleware::verify();
        $id = (int) ($params['id'] ?? 0);

        if ($id <= 0) {
            Response::badRequest('Valid notification ID required');
        }

        NotificationRepository::markAsRead($id);

        Response::success(null, 'Notification marked as read');
    }

    /**
     * Mark all notifications as read for current user/role.
     * POST /api/v2/notifications/mark-all-read
     */
    public function markAllAsRead(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        NotificationRepository::markAllAsRead((int) $user['id'], $user['role_name']);

        Response::success(null, 'All notifications marked as read');
    }

    /**
     * Delete a single notification.
     * DELETE /api/v2/notifications/{id}
     */
    public function delete(array $params): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];
        $id = (int) ($params['id'] ?? 0);

        if ($id <= 0) {
            Response::badRequest('Valid notification ID required');
        }

        $deleted = NotificationRepository::delete($id, (int) $user['id'], $user['role_name']);

        if (!$deleted) {
            Response::notFound('Notification not found or access denied');
        }

        Response::success(null, 'Notification deleted');
    }
}
