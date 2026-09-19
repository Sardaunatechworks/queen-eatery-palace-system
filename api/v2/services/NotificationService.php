<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Notification Service
 *
 * Centralized notification creation. Controllers should not write
 * notification SQL directly — use this service instead.
 */

declare(strict_types=1);

namespace App\Services;

use App\Repositories\NotificationRepository;

class NotificationService
{
    /**
     * Send notification to a specific user.
     */
    public static function toUser(int $userId, string $title, string $message, string $type = NOTIFY_SYSTEM): void
    {
        try {
            NotificationRepository::create($userId, null, $title, $message, $type);
        } catch (\Throwable $e) {
            error_log("NotificationService::toUser failed: " . $e->getMessage());
        }
    }

    /**
     * Send notification to all users of a specific role.
     */
    public static function toRole(string $role, string $title, string $message, string $type = NOTIFY_SYSTEM): void
    {
        try {
            NotificationRepository::create(null, $role, $title, $message, $type);
        } catch (\Throwable $e) {
            error_log("NotificationService::toRole failed: " . $e->getMessage());
        }
    }

    /**
     * Send order notification to cashier(s).
     */
    public static function orderReceived(string $orderNumber, float $total): void
    {
        self::toRole(
            ROLE_CASHIER,
            'New Order Placed',
            "Order {$orderNumber} has been received. Total: ₦" . number_format($total, 2),
            NOTIFY_ORDER
        );
    }

    /**
     * Alias for orderReceived
     */
    public static function newOrder(string $orderNumber, float $total, ?int $orderId = null): void
    {
        self::orderReceived($orderNumber, $total);
    }

    /**
     * Send notification when kitchen marks table order ready.
     */
    public static function tableOrderReady(string $tableNumber, string $orderNumber): void
    {
        self::toRole(
            ROLE_CASHIER,
            'Table Order Ready',
            "Order {$orderNumber} for {$tableNumber} is ready to be served.",
            NOTIFY_ORDER
        );
    }

    /**
     * Send order status update to customer.
     */
    public static function orderStatusUpdated(int $customerId, string $orderNumber, string $newStatus): void
    {
        self::toUser(
            $customerId,
            'Order Update',
            "Your order {$orderNumber} status is now: " . ucfirst(str_replace('_', ' ', $newStatus)),
            NOTIFY_ORDER
        );
    }

    /**
     * General create method delegating to repository.
     */
    public static function create(
        ?int $userId,
        ?string $role,
        string $title,
        string $message,
        string $type = NOTIFY_SYSTEM
    ): void {
        try {
            NotificationRepository::create($userId, $role, $title, $message, $type);
        } catch (\Throwable $e) {
            error_log("NotificationService::create failed: " . $e->getMessage());
        }
    }

    /**
     * Send payment confirmation to cashier(s).
     */
    public static function paymentVerified(string $orderNumber, float $amount): void
    {
        self::toRole(
            ROLE_CASHIER,
            'Payment Confirmed',
            "Order {$orderNumber} has been paid. Amount: ₦" . number_format($amount, 2),
            NOTIFY_PAYMENT
        );
    }

    /**
     * Alias for paymentVerified
     */
    public static function paymentReceived(string $orderNumber, float $amount, string $method = 'paystack'): void
    {
        self::paymentVerified($orderNumber, $amount);
    }

    /**
     * Send low stock alert to admin.
     */
    public static function lowStockAlert(string $itemName, float|int $quantity, float|int $threshold): void
    {
        self::toRole(
            ROLE_ADMIN,
            'Low Stock Alert',
            "'{$itemName}' is running low. Current stock: {$quantity} (threshold: {$threshold})",
            NOTIFY_STOCK
        );
    }

    /**
     * Send event hall inquiry notification to admin.
     */
    public static function eventHallInquiry(string $fullName, string $eventType): void
    {
        self::toRole(
            ROLE_ADMIN,
            'New Event Hall Inquiry',
            "{$fullName} has submitted an inquiry for: {$eventType}",
            NOTIFY_EVENT_HALL
        );
    }

    /**
     * Send system broadcast notification to all users.
     */
    public static function systemBroadcast(string $title, string $message): void
    {
        try {
            NotificationRepository::create(null, null, $title, $message, NOTIFY_SYSTEM);
        } catch (\Throwable $e) {
            error_log("NotificationService::systemBroadcast failed: " . $e->getMessage());
        }
    }
}
