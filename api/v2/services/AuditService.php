<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Audit Service
 */

declare(strict_types=1);

namespace App\Services;

use App\Repositories\AuditRepository;

class AuditService
{
    /**
     * Log a general audit event.
     */
    public static function log(
        string $action,
        ?string $entityType = null,
        ?string $entityId = null,
        ?string $description = null,
        ?array $oldValues = null,
        ?array $newValues = null
    ): void {
        try {
            $user = $_REQUEST['auth_user'] ?? null;
            $userId = $user['id'] ?? null;
            $userName = $user['full_name'] ?? null;
            $ip = self::getClientIp();

            AuditRepository::create(
                $userId,
                $userName,
                $action,
                $entityType,
                $entityId,
                $description,
                $oldValues,
                $newValues,
                $ip
            );
        } catch (\Throwable $e) {
            error_log("AuditService::log failed: " . $e->getMessage());
        }
    }

    // ============================================
    // Domain-specific audit methods
    // ============================================

    public static function staffCreated(int $staffId, string $staffName, string $role): void
    {
        self::log('staff.created', 'user', (string)$staffId, "Created staff account: {$staffName} ({$role})");
    }

    public static function staffSuspended(int $staffId, string $staffName, string $reason): void
    {
        self::log('staff.suspended', 'user', (string)$staffId, "Suspended: {$staffName}. Reason: {$reason}");
    }

    public static function staffReactivated(int $staffId, string $staffName): void
    {
        self::log('staff.reactivated', 'user', (string)$staffId, "Reactivated staff account: {$staffName}");
    }

    public static function permissionsUpdated(int $staffId, string $staffName): void
    {
        self::log('permissions.updated', 'user', (string)$staffId, "Permissions updated for: {$staffName}");
    }

    public static function passwordReset(int $userId): void
    {
        self::log('password.reset', 'user', (string)$userId, 'Password was reset');
    }

    public static function orderCreated(int $orderId, string $orderNumber): void
    {
        self::log('order.created', 'order', (string)$orderId, "Order created: {$orderNumber}");
    }

    public static function orderStatusChanged(int $orderId, string $oldStatus, string $newStatus): void
    {
        self::log('order.status_changed', 'order', (string)$orderId,
            "Order status changed: {$oldStatus} → {$newStatus}",
            ['status' => $oldStatus],
            ['status' => $newStatus]
        );
    }

    public static function orderCancelled(int $orderId, string $orderNumber): void
    {
        self::log('order.cancelled', 'order', (string)$orderId, "Order cancelled: {$orderNumber}");
    }

    public static function paymentVerified(int $orderId, string $reference, float $amount): void
    {
        self::log('payment.verified', 'order', (string)$orderId,
            "Payment verified. Reference: {$reference}, Amount: ₦" . number_format($amount, 2));
    }

    public static function stockAdjusted(int $menuItemId, string $itemName, string $type, int $qty): void
    {
        self::log('inventory.adjusted', 'menu_item', (string)$menuItemId,
            "Stock {$type}: {$itemName} by {$qty} units");
    }

    public static function menuItemCreated(int $itemId, string $itemName): void
    {
        self::log('menu.created', 'menu_item', (string)$itemId, "Menu item created: {$itemName}");
    }

    public static function menuItemUpdated(int $itemId, string $itemName): void
    {
        self::log('menu.updated', 'menu_item', (string)$itemId, "Menu item updated: {$itemName}");
    }

    public static function menuItemDeleted(int $itemId, string $itemName): void
    {
        self::log('menu.deleted', 'menu_item', (string)$itemId, "Menu item deleted: {$itemName}");
    }

    public static function cmsUpdated(string $section): void
    {
        self::log('cms.updated', 'cms', $section, "CMS section updated: {$section}");
    }

    public static function userLogin(int $userId, string $userName): void
    {
        self::log('auth.login', 'user', (string)$userId, "User logged in: {$userName}");
    }

    // ============================================
    // Helpers
    // ============================================

    private static function getClientIp(): string
    {
        $keys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];
        foreach ($keys as $key) {
            if (!empty($_SERVER[$key])) {
                $ips = explode(',', $_SERVER[$key]);
                return trim($ips[0]);
            }
        }
        return '0.0.0.0';
    }
}
