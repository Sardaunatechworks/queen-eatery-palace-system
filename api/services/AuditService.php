<?php
/**
 * Queen Eatery Palace - Audit Service
 * 
 * Logs sensitive actions to the audit_logs table.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;

class AuditService
{
    /**
     * Log an audit event.
     */
    public static function log(
        string $action,
        ?string $entityType = null,
        ?string $entityId = null,
        ?string $description = null,
        ?int $userId = null
    ): void {
        try {
            // Get the authenticated user ID if not provided
            if ($userId === null) {
                $authUser = $_REQUEST['auth_user'] ?? null;
                $userId = $authUser ? (int) $authUser['id'] : null;
            }

            // Get the client IP address
            $ipAddress = self::getClientIp();

            $db = Database::getConnection();
            $stmt = $db->prepare('
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, ip_address)
                VALUES (:uid, :action, :entity_type, :entity_id, :description, :ip)
            ');
            $stmt->execute([
                'uid'         => $userId,
                'action'      => $action,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'description' => $description,
                'ip'          => $ipAddress,
            ]);
        } catch (\Throwable $e) {
            // Audit logging should never crash the application
            error_log("AuditService Error: " . $e->getMessage());
        }
    }

    /**
     * Common audit actions as named methods.
     */
    public static function userLogin(int $userId, string $email): void
    {
        self::log('LOGIN', 'user', (string) $userId, "User logged in: {$email}", $userId);
    }

    public static function userLogout(int $userId): void
    {
        self::log('LOGOUT', 'user', (string) $userId, null, $userId);
    }

    public static function userCreated(int $newUserId, string $email, string $role): void
    {
        self::log('CREATE_USER', 'user', (string) $newUserId, "Created {$role} account: {$email}");
    }

    public static function userUpdated(int $targetUserId, string $field): void
    {
        self::log('UPDATE_USER', 'user', (string) $targetUserId, "Updated field: {$field}");
    }

    public static function userStatusChanged(int $targetUserId, string $oldStatus, string $newStatus): void
    {
        self::log('STATUS_CHANGE', 'user', (string) $targetUserId, "Status changed: {$oldStatus} → {$newStatus}");
    }

    public static function userDeleted(int $targetUserId, string $email): void
    {
        self::log('DELETE_USER', 'user', (string) $targetUserId, "Deleted user: {$email}");
    }

    public static function passwordChanged(int $userId): void
    {
        self::log('PASSWORD_CHANGE', 'user', (string) $userId, null, $userId);
    }

    public static function passwordReset(string $email): void
    {
        self::log('PASSWORD_RESET_REQUEST', 'user', null, "Reset requested for: {$email}");
    }

    public static function permissionChanged(int $targetUserId, string $permission, bool $granted): void
    {
        $action = $granted ? 'GRANT_PERMISSION' : 'REVOKE_PERMISSION';
        self::log($action, 'user', (string) $targetUserId, "Permission: {$permission}");
    }

    public static function orderCreated(int $orderId, string $orderNumber): void
    {
        self::log('CREATE_ORDER', 'order', (string) $orderId, "Order: {$orderNumber}");
    }

    public static function orderStatusChanged(int $orderId, string $oldStatus, string $newStatus): void
    {
        self::log('UPDATE_ORDER_STATUS', 'order', (string) $orderId, "Status: {$oldStatus} → {$newStatus}");
    }

    public static function paymentVerified(int $orderId, string $reference, string $amount): void
    {
        self::log('VERIFY_PAYMENT', 'transaction', (string) $orderId, "Ref: {$reference}, Amount: {$amount}");
    }

    public static function menuItemCreated(int $itemId, string $name): void
    {
        self::log('CREATE_MENU_ITEM', 'menu_item', (string) $itemId, "Item: {$name}");
    }

    public static function menuItemApproved(int $itemId, string $name): void
    {
        self::log('APPROVE_MENU_ITEM', 'menu_item', (string) $itemId, "Approved: {$name}");
    }

    public static function cmsUpdated(string $section): void
    {
        self::log('UPDATE_CMS', 'cms', $section, "CMS section updated: {$section}");
    }

    /**
     * Get the client's IP address.
     */
    private static function getClientIp(): string
    {
        $headers = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'REMOTE_ADDR'];
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = explode(',', $_SERVER[$header])[0];
                $ip = trim($ip);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return '0.0.0.0';
    }
}
