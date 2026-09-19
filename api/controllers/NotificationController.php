<?php
/**
 * Queen Eatery Palace - Notification Controller
 * 
 * Handles listing, marking read, and clearing notifications for users or their roles.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Middleware\AuthMiddleware;
use PDO;

class NotificationController
{
    /**
     * Get all notifications for authenticated user/role
     * GET /api/notifications
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $db = Database::getConnection();
        
        $stmt = $db->prepare('
            SELECT * FROM notifications
            WHERE (user_id = :uid OR role_target = :role OR (user_id IS NULL AND role_target IS NULL))
            ORDER BY created_at DESC
            LIMIT 50
        ');
        $stmt->execute([
            'uid'  => $user['id'],
            'role' => $user['role_name']
        ]);
        $notifications = $stmt->fetchAll();

        foreach ($notifications as &$n) {
            $n['id'] = (string)$n['id'];
            $n['user_id'] = $n['user_id'] ? (string)$n['user_id'] : null;
            $n['is_read'] = (bool)$n['is_read'];
            $n['created_at_ts'] = strtotime($n['created_at']);
        }

        Response::success($notifications);
    }

    /**
     * Mark single notification as read
     * PATCH /api/notifications/{id}/read
     */
    public function markAsRead(int $id): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $db = Database::getConnection();

        // Fetch notification
        $stmt = $db->prepare('SELECT * FROM notifications WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $n = $stmt->fetch();

        if (!$n) {
            Response::notFound('Notification not found');
        }

        // Validate authorization
        if (
            $n['user_id'] !== null && (int)$n['user_id'] !== $user['id'] &&
            $n['role_target'] !== null && $n['role_target'] !== $user['role_name']
        ) {
            Response::forbidden('Access denied');
        }

        $stmt = $db->prepare('UPDATE notifications SET is_read = 1 WHERE id = :id');
        $stmt->execute(['id' => $id]);

        Response::success(null, 'Notification marked as read');
    }

    /**
     * Mark all notifications for this user/role as read
     * POST /api/notifications/mark-all-read
     */
    public function markAllAsRead(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $db = Database::getConnection();

        $stmt = $db->prepare('
            UPDATE notifications 
            SET is_read = 1 
            WHERE (user_id = :uid OR role_target = :role OR (user_id IS NULL AND role_target IS NULL))
              AND is_read = 0
        ');
        $stmt->execute([
            'uid'  => $user['id'],
            'role' => $user['role_name']
        ]);

        Response::success(null, 'All notifications marked as read');
    }
}
