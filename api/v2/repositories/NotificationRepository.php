<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Notification Repository
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class NotificationRepository
{
    /**
     * Create a notification.
     */
    public static function create(?int $userId, ?string $roleTarget, string $title, string $message, string $type): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO notifications (user_id, role_target, title, message, type, is_read)
            VALUES (:uid, :role, :title, :message, :type, 0)
        ');
        $stmt->execute([
            'uid'     => $userId,
            'role'    => $roleTarget,
            'title'   => $title,
            'message' => $message,
            'type'    => $type,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Get notifications for a user (by user_id or role_target).
     */
    public static function getForUser(int $userId, string $role, int $page = 1, int $perPage = 20): array
    {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;

        $isAdminRole = ($role === ROLE_SUPER_ADMIN || $role === ROLE_ADMIN);
        $roleCondition = $isAdminRole
            ? "(user_id = :uid OR role_target IN ('admin', 'super_admin') OR role_target IS NULL)"
            : "(user_id = :uid OR role_target = :role OR role_target IS NULL)";
        $roleFetchCondition = $isAdminRole
            ? "(user_id = :uid OR role_target IN ('admin', 'super_admin') OR (role_target IS NULL AND user_id IS NULL))"
            : "(user_id = :uid OR role_target = :role OR (role_target IS NULL AND user_id IS NULL))";

        // Count
        $countStmt = $db->prepare("SELECT COUNT(id) FROM notifications WHERE {$roleCondition}");
        $params = ['uid' => $userId];
        if (!$isAdminRole) {
            $params['role'] = $role;
        }
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $stmt = $db->prepare("
            SELECT id, title, message, type, is_read, created_at
            FROM notifications
            WHERE {$roleFetchCondition}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        if (!$isAdminRole) {
            $stmt->bindValue(':role', $role);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['data' => $stmt->fetchAll(), 'total' => $total];
    }

    /**
     * Get unread count for a user.
     */
    public static function getUnreadCount(int $userId, string $role): int
    {
        $db = Database::getConnection();
        $isAdminRole = ($role === ROLE_SUPER_ADMIN || $role === ROLE_ADMIN);
        $roleCondition = $isAdminRole
            ? "(user_id = :uid OR role_target IN ('admin', 'super_admin') OR (role_target IS NULL AND user_id IS NULL))"
            : "(user_id = :uid OR role_target = :role OR (role_target IS NULL AND user_id IS NULL))";

        $stmt = $db->prepare("
            SELECT COUNT(id) FROM notifications
            WHERE is_read = 0
            AND {$roleCondition}
        ");
        $params = ['uid' => $userId];
        if (!$isAdminRole) {
            $params['role'] = $role;
        }
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Mark a notification as read.
     */
    public static function markAsRead(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('UPDATE notifications SET is_read = 1 WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Mark all notifications as read for a user.
     */
    public static function markAllAsRead(int $userId, string $role): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE notifications SET is_read = 1
            WHERE is_read = 0
            AND (user_id = :uid OR role_target = :role OR (role_target IS NULL AND user_id IS NULL))
        ');
        $stmt->execute(['uid' => $userId, 'role' => $role]);
    }

    /**
     * Delete a notification if authorized.
     */
    public static function delete(int $id, int $userId, string $role): bool
    {
        $db = Database::getConnection();

        // Check if admin or owner
        if ($role === 'super_admin' || $role === 'admin') {
            $stmt = $db->prepare('DELETE FROM notifications WHERE id = :id');
            $stmt->execute(['id' => $id]);
            return $stmt->rowCount() > 0;
        }

        $stmt = $db->prepare('
            DELETE FROM notifications 
            WHERE id = :id AND (user_id = :uid OR role_target = :role)
        ');
        $stmt->execute(['id' => $id, 'uid' => $userId, 'role' => $role]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Get unread notifications created since a specific datetime (for SSE stream).
     */
    public static function getLatestUnread(int $userId, string $role, string $since): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT id, title, message, type, is_read, created_at
            FROM notifications
            WHERE (user_id = :uid OR role_target = :role OR (role_target IS NULL AND user_id IS NULL))
              AND is_read = 0
              AND created_at >= :since
            ORDER BY created_at DESC
            LIMIT 50
        ');
        $stmt->execute([
            'uid'   => $userId,
            'role'  => $role,
            'since' => $since,
        ]);

        return $stmt->fetchAll();
    }
}
