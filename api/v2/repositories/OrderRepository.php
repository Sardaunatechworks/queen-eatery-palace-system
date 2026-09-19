<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Order Repository
 *
 * Encapsulates all data access for orders, order items, tables, and order numbers.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class OrderRepository
{
    /**
     * Generate next sequential order number: QEP-YYYYMMDD-XXXX
     * Atomically increments the order_counter.
     */
    public static function getNextOrderNumber(): string
    {
        $db = Database::getConnection();
        $datePrefix = 'QEP-' . date('Ymd') . '-';

        // Increment counter atomically
        $stmt = $db->prepare('
            INSERT INTO order_counter (id, current_count)
            VALUES (1, 1)
            ON DUPLICATE KEY UPDATE current_count = current_count + 1
        ');
        $stmt->execute();

        $countStmt = $db->query('SELECT current_count FROM order_counter WHERE id = 1');
        $count = (int) $countStmt->fetchColumn();

        return $datePrefix . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }

    /**
     * List paginated orders with filters.
     */
    public static function list(int $page, int $perPage, array $filters = []): array
    {
        $db = Database::getConnection();

        $where = ['1=1'];
        $params = [];

        if (!empty($filters['search'])) {
            $where[] = '(o.order_number LIKE :search OR o.customer_name LIKE :search OR o.guest_name LIKE :search OR o.table_number LIKE :search OR u.full_name LIKE :search OR u.phone LIKE :search)';
            $params['search'] = '%' . $filters['search'] . '%';
        }

        if (!empty($filters['order_status'])) {
            $where[] = 'o.order_status = :order_status';
            $params['order_status'] = $filters['order_status'];
        }

        if (!empty($filters['payment_status'])) {
            $where[] = 'o.payment_status = :payment_status';
            $params['payment_status'] = $filters['payment_status'];
        }

        if (!empty($filters['order_type'])) {
            $where[] = 'o.order_type = :order_type';
            $params['order_type'] = $filters['order_type'];
        }

        if (!empty($filters['source'])) {
            $where[] = 'o.source = :source';
            $params['source'] = $filters['source'];
        }

        if (!empty($filters['table_id'])) {
            $where[] = 'o.table_id = :table_id';
            $params['table_id'] = (int) $filters['table_id'];
        }

        if (!empty($filters['customer_id'])) {
            $where[] = 'o.customer_id = :customer_id';
            $params['customer_id'] = (int) $filters['customer_id'];
        }

        if (!empty($filters['date_from'])) {
            $where[] = 'o.created_at >= :date_from';
            $params['date_from'] = $filters['date_from'] . ' 00:00:00';
        }

        if (!empty($filters['date_to'])) {
            $where[] = 'o.created_at <= :date_to';
            $params['date_to'] = $filters['date_to'] . ' 23:59:59';
        }

        $whereClause = implode(' AND ', $where);

        // Count total
        $countStmt = $db->prepare("
            SELECT COUNT(o.id)
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE {$whereClause}
        ");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch page
        $offset = ($page - 1) * $perPage;
        $stmt = $db->prepare("
            SELECT o.*,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email,
                   u.phone AS customer_user_phone,
                   c.full_name AS cashier_name,
                   rt.name AS table_label,
                   rt.table_number AS rt_table_number
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE {$whereClause}
            ORDER BY o.created_at DESC
            LIMIT :limit OFFSET :offset
        ");

        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $records = $stmt->fetchAll();
        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return [
            'data'  => $records,
            'total' => $total,
        ];
    }

    /**
     * Find active workflow orders for cashier monitor and management.
     * Includes submitted (new QR guest orders), pending, accepted, preparing, ready, and served.
     */
    public static function findActiveOrders(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT o.*,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email,
                   u.phone AS customer_user_phone,
                   c.full_name AS cashier_name,
                   rt.name AS table_label,
                   rt.table_number AS rt_table_number
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE o.order_status IN ("submitted", "pending", "accepted", "preparing", "ready", "served")
              AND (
                  o.source = "qr_guest"
                  OR o.source = "cashier"
                  OR (o.source IN ("online_customer", "customer") AND o.payment_status = "paid")
              )
            ORDER BY o.created_at ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Find active kitchen tickets.
     * Crucial: Kitchen ONLY receives accepted and preparing orders.
     * Unaccepted "submitted" QR orders never appear here until cashier accepts them.
     */
    public static function findKitchenOrders(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT o.*,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email,
                   u.phone AS customer_user_phone,
                   c.full_name AS cashier_name,
                   rt.name AS table_label,
                   rt.table_number AS rt_table_number
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE o.order_status IN ("accepted", "preparing")
            ORDER BY o.created_at ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Find order by ID.
     */
    public static function findById(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT o.*,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email,
                   u.phone AS customer_user_phone,
                   c.full_name AS cashier_name,
                   rt.name AS table_label,
                   rt.table_number AS rt_table_number
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE o.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find order by order number.
     */
    public static function findByOrderNumber(string $orderNumber): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT o.*,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email,
                   u.phone AS customer_user_phone,
                   c.full_name AS cashier_name,
                   rt.name AS table_label,
                   rt.table_number AS rt_table_number
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            WHERE o.order_number = :num
            LIMIT 1
        ');
        $stmt->execute(['num' => trim($orderNumber)]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find order by ID with row lock (FOR UPDATE).
     */
    public static function findWithLock(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT * FROM orders
            WHERE id = :id
            FOR UPDATE
        ');
        $stmt->execute(['id' => $id]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find customer order history.
     */
    public static function findCustomerOrders(int $customerId, int $page, int $perPage): array
    {
        $db = Database::getConnection();

        $countStmt = $db->prepare('SELECT COUNT(id) FROM orders WHERE customer_id = :cid');
        $countStmt->execute(['cid' => $customerId]);
        $total = (int) $countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt = $db->prepare('
            SELECT o.*
            FROM orders o
            WHERE o.customer_id = :cid
            ORDER BY o.created_at DESC
            LIMIT :limit OFFSET :offset
        ');
        $stmt->bindValue(':cid', $customerId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $records = $stmt->fetchAll();
        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return [
            'data'  => $records,
            'total' => $total,
        ];
    }

    /**
     * Create order header. Returns new order ID.
     */
    public static function create(array $data): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO orders (
                order_number, customer_id, cashier_id, customer_name, cashier_name, guest_name,
                guest_access_token, idempotency_token, source, table_id, table_number,
                order_type, subtotal, packaging_quantity, packaging_unit_price, packaging_fee,
                delivery_fee, discount_amount, total, payment_status, payment_method, payment_timing, order_status, delivery_address, notes
            ) VALUES (
                :order_number, :customer_id, :cashier_id, :customer_name, :cashier_name, :guest_name,
                :guest_access_token, :idempotency_token, :source, :table_id, :table_number,
                :order_type, :subtotal, :packaging_quantity, :packaging_unit_price, :packaging_fee,
                :delivery_fee, :discount_amount, :total, :payment_status, :payment_method, :payment_timing, :order_status, :delivery_address, :notes
            )
        ');

        $stmt->execute([
            'order_number'         => $data['order_number'],
            'customer_id'          => $data['customer_id'] ?? null,
            'cashier_id'           => $data['cashier_id'] ?? null,
            'customer_name'        => $data['customer_name'] ?? null,
            'cashier_name'         => $data['cashier_name'] ?? null,
            'guest_name'           => $data['guest_name'] ?? null,
            'guest_access_token'   => $data['guest_access_token'] ?? null,
            'idempotency_token'    => $data['idempotency_token'] ?? null,
            'source'               => $data['source'] ?? 'customer',
            'table_id'             => $data['table_id'] ?? null,
            'table_number'         => $data['table_number'] ?? null,
            'order_type'           => $data['order_type'] ?? 'pickup',
            'subtotal'             => $data['subtotal'] ?? 0.00,
            'packaging_quantity'   => (int) ($data['packaging_quantity'] ?? 0),
            'packaging_unit_price' => (float) ($data['packaging_unit_price'] ?? 0.00),
            'packaging_fee'        => (float) ($data['packaging_fee'] ?? 0.00),
            'delivery_fee'         => (float) ($data['delivery_fee'] ?? 0.00),
            'discount_amount'      => (float) ($data['discount_amount'] ?? 0.00),
            'total'                => $data['total'] ?? 0.00,
            'payment_status'       => $data['payment_status'] ?? 'pending',
            'payment_method'       => $data['payment_method'] ?? null,
            'payment_timing'       => $data['payment_timing'] ?? 'after_meal',
            'order_status'         => $data['order_status'] ?? 'pending',
            'delivery_address'     => $data['delivery_address'] ?? null,
            'notes'                => $data['notes'] ?? null,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Insert order items in batch.
     */
    public static function createOrderItems(int $orderId, array $items): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, subtotal, notes)
            VALUES (:oid, :mid, :name, :qty, :price, :subtotal, :notes)
        ');

        foreach ($items as $item) {
            $stmt->execute([
                'oid'      => $orderId,
                'mid'      => $item['menu_item_id'] ?? null,
                'name'     => $item['item_name'],
                'qty'      => (int) $item['quantity'],
                'price'    => (float) $item['unit_price'],
                'subtotal' => (float) ($item['subtotal'] ?? ($item['quantity'] * $item['unit_price'])),
                'notes'    => $item['notes'] ?? null,
            ]);
        }
    }

    /**
     * Batch load order items for an array of order IDs in a single query.
     */
    public static function getOrderItemsBatch(array $orderIds): array
    {
        if (empty($orderIds)) {
            return [];
        }

        $db = Database::getConnection();
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

        $grouped = [];
        foreach ($orderIds as $id) {
            $grouped[$id] = [];
        }

        foreach ($allItems as $item) {
            $orderId = (int) $item['order_id'];
            $item['id']           = (int) $item['id'];
            $item['order_id']     = (int) $item['order_id'];
            $item['menu_item_id'] = $item['menu_item_id'] !== null ? (int) $item['menu_item_id'] : null;
            $item['quantity']     = (int) $item['quantity'];
            $item['unit_price']   = (float) $item['unit_price'];
            $item['subtotal']     = (float) $item['subtotal'];
            $item['special_instructions'] = $item['notes'] ?? null;

            $grouped[$orderId][] = $item;
        }

        return $grouped;
    }

    /**
     * Update order workflow status.
     */
    public static function updateStatus(int $id, string $status): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE orders
            SET order_status = :status, updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute([
            'status' => $status,
            'id'     => $id,
        ]);
    }

    /**
     * Cashier accepts an incoming QR or pending order.
     */
    public static function acceptOrder(int $orderId, int $cashierId): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE orders
            SET order_status = "accepted",
                accepted_by = :cid,
                accepted_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute([
            'cid' => $cashierId,
            'id'  => $orderId,
        ]);
    }

    /**
     * Cashier rejects an incoming order.
     */
    public static function rejectOrder(int $orderId, int $cashierId, string $reason): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE orders
            SET order_status = "rejected",
                rejected_at = NOW(),
                rejection_reason = :reason,
                updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute([
            'reason' => $reason,
            'id'     => $orderId,
        ]);
    }

    /**
     * Mark an order as served at table / counter.
     */
    public static function markServed(int $orderId): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE orders
            SET order_status = "served",
                served_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute(['id' => $orderId]);
    }

    /**
     * Update order payment status and optional payment method.
     */
    public static function updatePaymentStatus(int $id, string $paymentStatus, ?string $paymentMethod = null): void
    {
        $db = Database::getConnection();

        if ($paymentMethod !== null) {
            $stmt = $db->prepare('
                UPDATE orders
                SET payment_status = :pstatus, payment_method = :pmethod, updated_at = NOW()
                WHERE id = :id
            ');
            $stmt->execute([
                'pstatus' => $paymentStatus,
                'pmethod' => $paymentMethod,
                'id'      => $id,
            ]);
        } else {
            $stmt = $db->prepare('
                UPDATE orders
                SET payment_status = :pstatus, updated_at = NOW()
                WHERE id = :id
            ');
            $stmt->execute([
                'pstatus' => $paymentStatus,
                'id'      => $id,
            ]);
        }
    }

    /**
     * Delete order.
     */
    public static function delete(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM orders WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Single aggregated query for lightweight cashier operational counters.
     */
    public static function getDashboardSummary(): array
    {
        $db = Database::getConnection();
        $today = date('Y-m-d 00:00:00');

        $stmt = $db->query("
            SELECT
                COUNT(CASE WHEN o.order_status = 'submitted' AND o.source IN ('online_customer', 'customer') AND o.payment_status = 'paid' THEN 1 END) AS new_online,
                COUNT(CASE WHEN o.order_status = 'submitted' AND o.source = 'qr_guest' THEN 1 END) AS new_qr,
                COUNT(CASE WHEN o.order_status = 'submitted' AND (o.source = 'qr_guest' OR (o.source IN ('online_customer', 'customer') AND o.payment_status = 'paid')) THEN 1 END) AS new_total,
                COUNT(CASE WHEN o.order_status = 'accepted' THEN 1 END) AS accepted,
                COUNT(CASE WHEN o.order_status = 'preparing' THEN 1 END) AS preparing,
                COUNT(CASE WHEN o.order_status = 'ready' THEN 1 END) AS ready,
                COUNT(CASE WHEN o.order_status = 'served' THEN 1 END) AS served,
                COUNT(CASE WHEN o.order_status = 'completed' AND o.created_at >= '{$today}' THEN 1 END) AS completed_today
            FROM orders o
        ");
        $counts = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        return [
            'new_online'      => (int) ($counts['new_online'] ?? 0),
            'new_qr'          => (int) ($counts['new_qr'] ?? 0),
            'new_total'       => (int) ($counts['new_total'] ?? 0),
            'accepted'        => (int) ($counts['accepted'] ?? 0),
            'preparing'       => (int) ($counts['preparing'] ?? 0),
            'ready'           => (int) ($counts['ready'] ?? 0),
            'served'          => (int) ($counts['served'] ?? 0),
            'completed_today' => (int) ($counts['completed_today'] ?? 0),
        ];
    }

    /**
     * Type-cast integer and float fields.
     */
    private static function castTypes(array &$rec): void
    {
        $rec['id'] = (int) $rec['id'];
        if (isset($rec['customer_id'])) {
            $rec['customer_id'] = $rec['customer_id'] !== null ? (int) $rec['customer_id'] : null;
        }
        if (isset($rec['cashier_id'])) {
            $rec['cashier_id'] = $rec['cashier_id'] !== null ? (int) $rec['cashier_id'] : null;
        }
        if (isset($rec['table_id'])) {
            $rec['table_id'] = $rec['table_id'] !== null ? (int) $rec['table_id'] : null;
        }
        $rec['subtotal'] = (float) $rec['subtotal'];
        $rec['packaging_quantity'] = isset($rec['packaging_quantity']) ? (int) $rec['packaging_quantity'] : 0;
        $rec['packaging_unit_price'] = isset($rec['packaging_unit_price']) ? (float) $rec['packaging_unit_price'] : 0.00;
        $rec['packaging_fee'] = isset($rec['packaging_fee']) ? (float) $rec['packaging_fee'] : 0.00;
        $rec['delivery_fee'] = isset($rec['delivery_fee']) ? (float) $rec['delivery_fee'] : 0.00;
        $rec['discount_amount'] = isset($rec['discount_amount']) ? (float) $rec['discount_amount'] : 0.00;
        $rec['total'] = (float) $rec['total'];

        // Backward compatibility and convenience mappings
        $rec['orderId'] = $rec['order_number'];
        $rec['total_amount'] = $rec['total'];
        $rec['status'] = $rec['order_status'];
        $rec['deliveryType'] = $rec['order_type'];
        $rec['paymentStatus'] = $rec['payment_status'];
        $rec['customerName'] = $rec['guest_name'] ?? $rec['customer_name'] ?? $rec['customer_user_name'] ?? 'Counter Customer';
        $rec['customerPhone'] = $rec['customer_phone'] ?? $rec['customer_user_phone'] ?? $rec['phone'] ?? null;
        $rec['customerEmail'] = $rec['customer_email'] ?? null;
        $rec['table_number'] = $rec['table_number'] ?? $rec['rt_table_number'] ?? null;
        $rec['tableNumber'] = $rec['table_number'];
        $rec['guestName'] = $rec['guest_name'] ?? null;
        $rec['paymentTiming'] = $rec['payment_timing'] ?? 'after_meal';
    }
}
