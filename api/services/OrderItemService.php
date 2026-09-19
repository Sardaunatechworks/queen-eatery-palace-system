<?php
/**
 * Queen Eatery Palace - Order Item Service
 * 
 * Reusable service for batch-loading order items to eliminate N+1 query patterns.
 * Instead of querying order_items per-order in a loop, this service collects
 * all order IDs and retrieves all items in a single query, then maps them back.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;

class OrderItemService
{
    /**
     * Batch-load order items for multiple orders in a single query.
     * Returns a map of [order_id => [items...]].
     *
     * @param int[] $orderIds Array of order IDs to load items for.
     * @return array<int, array> Map of order_id => items array.
     */
    public static function batchLoad(array $orderIds): array
    {
        if (empty($orderIds)) {
            return [];
        }

        $db = Database::getConnection();

        // Build IN clause with integer-cast placeholders for safety
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $params = array_map('intval', $orderIds);

        $stmt = $db->prepare("
            SELECT oi.*, m.image_path AS item_image
            FROM order_items oi
            LEFT JOIN menu_items m ON oi.menu_item_id = m.id
            WHERE oi.order_id IN ({$placeholders})
            ORDER BY oi.id ASC
        ");
        $stmt->execute($params);
        $allItems = $stmt->fetchAll();

        // Group items by order_id
        $grouped = [];
        foreach ($allItems as $item) {
            $orderId = (int)$item['order_id'];

            // Normalize types for frontend compatibility
            $item['id'] = (string)$item['id'];
            $item['order_id'] = (string)$item['order_id'];
            $item['menu_item_id'] = $item['menu_item_id'] ? (string)$item['menu_item_id'] : null;
            $item['unit_price'] = (float)$item['unit_price'];
            $item['quantity'] = (int)$item['quantity'];

            $grouped[$orderId][] = $item;
        }

        return $grouped;
    }

    /**
     * Attach items to an array of orders in-place.
     * Replaces the N+1 pattern of calling getOrderItems() per order.
     *
     * @param array &$orders Array of order rows (by reference).
     * @return void
     */
    public static function attachItems(array &$orders): void
    {
        if (empty($orders)) {
            return;
        }

        // Collect all order IDs
        $orderIds = array_map(fn($o) => (int)$o['id'], $orders);

        // Single batch query
        $itemsMap = self::batchLoad($orderIds);

        // Attach items to each order
        foreach ($orders as &$order) {
            $oid = (int)$order['id'];
            $order['items'] = $itemsMap[$oid] ?? [];
        }
    }

    /**
     * Normalize order fields for frontend compatibility.
     * Converts internal MySQL column names to the format the React frontend expects.
     *
     * @param array &$orders Array of order rows (by reference).
     * @return void
     */
    public static function normalizeForFrontend(array &$orders): void
    {
        foreach ($orders as &$order) {
            $order['id'] = (string)$order['id'];
            $order['user_id'] = !empty($order['customer_id']) ? (string)$order['customer_id'] : null;
            $order['total_amount'] = (float)$order['total'];
            $order['status'] = $order['order_status'];
        }
    }

    /**
     * Full pipeline: attach items + normalize for frontend.
     * Call this as a single step after fetching orders from the database.
     *
     * @param array &$orders Array of order rows (by reference).
     * @return void
     */
    public static function prepareForResponse(array &$orders): void
    {
        self::attachItems($orders);
        self::normalizeForFrontend($orders);
    }
}
