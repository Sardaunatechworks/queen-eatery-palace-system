<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Report Repository
 *
 * Encapsulates analytical queries, financial calculations,
 * and aggregated reporting metrics.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class ReportRepository
{
    /**
     * Get aggregate overview statistics for dashboard.
     */
    public static function getDashboardOverview(): array
    {
        $db = Database::getConnection();

        // 1. Order & Sales aggregations
        $orderStmt = $db->query('
            SELECT
                COALESCE(SUM(CASE WHEN payment_status = "paid" THEN total ELSE 0 END), 0.00) AS total_sales,
                COUNT(id) AS total_orders,
                COUNT(CASE WHEN order_status IN ("pending", "accepted", "preparing", "ready") THEN 1 END) AS active_orders,
                COALESCE(SUM(CASE WHEN payment_status = "paid" AND DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0.00) AS today_sales,
                COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS today_orders
            FROM orders
        ');
        $orderData = $orderStmt->fetch() ?: [];

        // 2. Customers count
        $custStmt = $db->query('
            SELECT COUNT(u.id)
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE r.name = "customer" AND u.status != "deleted"
        ');
        $totalCustomers = (int) $custStmt->fetchColumn();

        // 3. Low stock count
        $stockStmt = $db->query('
            SELECT COUNT(i.id)
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE i.quantity <= i.low_stock_threshold AND m.status != "disabled"
        ');
        $lowStockCount = (int) $stockStmt->fetchColumn();

        return [
            'totalSales'     => (float) ($orderData['total_sales'] ?? 0),
            'totalOrders'    => (int) ($orderData['total_orders'] ?? 0),
            'totalCustomers' => $totalCustomers,
            'activeOrders'   => (int) ($orderData['active_orders'] ?? 0),
            'todaySales'     => (float) ($orderData['today_sales'] ?? 0),
            'todayOrders'    => (int) ($orderData['today_orders'] ?? 0),
            'lowStockCount'  => $lowStockCount,
        ];
    }

    /**
     * Daily sales revenue trend within date range.
     */
    public static function getSalesTrend(string $startDate, string $endDate): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total), 0.00) AS total_sales,
                COUNT(id) AS order_count,
                COALESCE(AVG(total), 0.00) AS avg_order_value
            FROM orders
            WHERE payment_status = "paid"
              AND created_at >= :start AND created_at <= :end
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ');
        $stmt->execute([
            'start' => $startDate,
            'end'   => $endDate,
        ]);

        $rows = $stmt->fetchAll();
        return array_map(function ($row) {
            return [
                'date'            => $row['date'],
                'total_sales'     => (float) $row['total_sales'],
                'order_count'     => (int) $row['order_count'],
                'avg_order_value' => (float) $row['avg_order_value'],
            ];
        }, $rows);
    }

    /**
     * Sales grouped by payment method.
     */
    public static function getSalesByPaymentMethod(?string $startDate = null, ?string $endDate = null): array
    {
        $db = Database::getConnection();

        $sql = '
            SELECT
                payment_method,
                COALESCE(SUM(amount), 0.00) AS total_amount,
                COUNT(id) AS tx_count
            FROM transactions
            WHERE payment_status = "success"
        ';
        $params = [];

        if ($startDate !== null && $endDate !== null) {
            $sql .= ' AND created_at >= :start AND created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }

        $sql .= ' GROUP BY payment_method ORDER BY total_amount DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function ($row) {
            return [
                'payment_method' => $row['payment_method'],
                'total_amount'   => (float) $row['total_amount'],
                'tx_count'       => (int) $row['tx_count'],
            ];
        }, $rows);
    }

    /**
     * Sales grouped by menu category.
     */
    public static function getSalesByCategory(?string $startDate = null, ?string $endDate = null): array
    {
        $db = Database::getConnection();

        $sql = '
            SELECT
                c.id AS category_id,
                c.name AS category_name,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0.00) AS total_sales,
                COALESCE(SUM(oi.quantity), 0) AS items_sold
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN categories c ON m.category_id = c.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.payment_status = "paid"
        ';
        $params = [];

        if ($startDate !== null && $endDate !== null) {
            $sql .= ' AND o.created_at >= :start AND o.created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }

        $sql .= ' GROUP BY c.id, c.name ORDER BY total_sales DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function ($row) {
            return [
                'category_id'   => (int) $row['category_id'],
                'category_name' => $row['category_name'],
                'total_sales'   => (float) $row['total_sales'],
                'items_sold'    => (int) $row['items_sold'],
            ];
        }, $rows);
    }

    /**
     * Sales breakdown by order source (web, cashier, admin) and delivery type.
     */
    public static function getSalesByOrderSource(?string $startDate = null, ?string $endDate = null): array
    {
        $db = Database::getConnection();

        $sql = '
            SELECT
                source,
                order_type,
                COUNT(id) AS count,
                COALESCE(SUM(total), 0.00) AS total_sales
            FROM orders
            WHERE payment_status = "paid"
        ';
        $params = [];

        if ($startDate !== null && $endDate !== null) {
            $sql .= ' AND created_at >= :start AND created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }

        $sql .= ' GROUP BY source, order_type ORDER BY total_sales DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function ($row) {
            return [
                'source'      => $row['source'],
                'order_type'  => $row['order_type'],
                'count'       => (int) $row['count'],
                'total_sales' => (float) $row['total_sales'],
            ];
        }, $rows);
    }

    /**
     * Order workflow metrics (status splits, delivery breakdown, peak hours).
     */
    public static function getOrderMetrics(?string $startDate = null, ?string $endDate = null): array
    {
        $db = Database::getConnection();

        // 1. Status splits
        $statusSql = 'SELECT order_status AS status, COUNT(id) AS count FROM orders';
        $params = [];
        if ($startDate !== null && $endDate !== null) {
            $statusSql .= ' WHERE created_at >= :start AND created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }
        $statusSql .= ' GROUP BY order_status';

        $statusStmt = $db->prepare($statusSql);
        $statusStmt->execute($params);
        $statusSplits = $statusStmt->fetchAll();

        // 2. Order type breakdown (paid orders)
        $typeSql = '
            SELECT order_type, COUNT(id) AS count, COALESCE(SUM(total), 0.00) AS total_revenue
            FROM orders
            WHERE payment_status = "paid"
        ';
        if ($startDate !== null && $endDate !== null) {
            $typeSql .= ' AND created_at >= :start AND created_at <= :end';
        }
        $typeSql .= ' GROUP BY order_type';

        $typeStmt = $db->prepare($typeSql);
        $typeStmt->execute($params);
        $typeBreakdown = $typeStmt->fetchAll();

        // 3. Hourly volume
        $hourSql = '
            SELECT HOUR(created_at) AS hour, COUNT(id) AS order_count
            FROM orders
        ';
        if ($startDate !== null && $endDate !== null) {
            $hourSql .= ' WHERE created_at >= :start AND created_at <= :end';
        } else {
            $hourSql .= ' WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }
        $hourSql .= ' GROUP BY HOUR(created_at) ORDER BY hour ASC';

        $hourStmt = $db->prepare($hourSql);
        $hourStmt->execute($params);
        $hourlyVolume = $hourStmt->fetchAll();

        return [
            'status_splits'  => array_map(fn($r) => ['status' => $r['status'], 'count' => (int) $r['count']], $statusSplits),
            'type_breakdown' => array_map(fn($r) => ['order_type' => $r['order_type'], 'count' => (int) $r['count'], 'total_revenue' => (float) $r['total_revenue']], $typeBreakdown),
            'hourly_volume'  => array_map(fn($r) => ['hour' => (int) $r['hour'], 'order_count' => (int) $r['order_count']], $hourlyVolume),
        ];
    }

    /**
     * Inventory valuation and stock health report.
     */
    public static function getInventoryValuation(): array
    {
        $db = Database::getConnection();

        // Summary metrics
        $summaryStmt = $db->query('
            SELECT
                COUNT(i.id) AS total_tracked_items,
                COALESCE(SUM(i.quantity), 0) AS total_items_stock,
                COALESCE(SUM(i.quantity * m.price), 0.00) AS total_inventory_value,
                COUNT(CASE WHEN i.quantity <= 0 THEN 1 END) AS out_of_stock_count,
                COUNT(CASE WHEN i.quantity > 0 AND i.quantity <= i.low_stock_threshold THEN 1 END) AS low_stock_count
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE m.status != "disabled"
        ');
        $summary = $summaryStmt->fetch() ?: [];

        // Low stock items listing
        $lowStockStmt = $db->query('
            SELECT
                m.id AS menu_item_id,
                m.name,
                c.name AS category_name,
                m.price,
                i.quantity,
                i.low_stock_threshold,
                (i.quantity * m.price) AS stock_value
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE i.quantity <= i.low_stock_threshold AND m.status != "disabled"
            ORDER BY i.quantity ASC
        ');
        $lowStockItems = $lowStockStmt->fetchAll();

        return [
            'summary' => [
                'total_tracked_items'   => (int) ($summary['total_tracked_items'] ?? 0),
                'total_items_stock'     => (int) ($summary['total_items_stock'] ?? 0),
                'total_inventory_value' => (float) ($summary['total_inventory_value'] ?? 0),
                'out_of_stock_count'    => (int) ($summary['out_of_stock_count'] ?? 0),
                'low_stock_count'       => (int) ($summary['low_stock_count'] ?? 0),
            ],
            'low_stock_items' => array_map(fn($r) => [
                'menu_item_id'        => (int) $r['menu_item_id'],
                'name'                => $r['name'],
                'category_name'       => $r['category_name'] ?? 'Uncategorized',
                'price'               => (float) $r['price'],
                'quantity'            => (int) $r['quantity'],
                'low_stock_threshold' => (int) $r['low_stock_threshold'],
                'stock_value'         => (float) $r['stock_value'],
            ], $lowStockItems),
        ];
    }

    /**
     * Complete inventory valuation report for all items (for comprehensive export).
     */
    public static function getAllInventoryValuation(): array
    {
        $db = Database::getConnection();

        $stmt = $db->query('
            SELECT
                m.id AS menu_item_id,
                m.name,
                COALESCE(c.name, "Uncategorized") AS category_name,
                m.price,
                COALESCE(i.quantity, 0) AS quantity,
                COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold,
                (COALESCE(i.quantity, 0) * m.price) AS stock_value,
                m.track_inventory,
                COALESCE(m.unit_of_measure, "portion") AS unit_of_measure,
                m.status AS menu_status,
                i.updated_at AS last_updated
            FROM menu_items m
            LEFT JOIN inventory i ON i.menu_item_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE m.status != "disabled"
            ORDER BY c.name ASC, m.name ASC
        ');
        $items = $stmt->fetchAll();

        return array_map(function ($r) {
            $qty = (int) $r['quantity'];
            $threshold = (int) $r['low_stock_threshold'];
            $status = $qty <= 0 ? 'Out of Stock' : ($qty <= $threshold ? 'Low Stock' : 'In Stock');

            return [
                'menu_item_id'        => (int) $r['menu_item_id'],
                'name'                => $r['name'],
                'category_name'       => $r['category_name'],
                'price'               => (float) $r['price'],
                'quantity'            => $qty,
                'low_stock_threshold' => $threshold,
                'stock_status'        => $status,
                'stock_value'         => (float) $r['stock_value'],
                'track_inventory'     => (bool) $r['track_inventory'],
                'unit_of_measure'     => $r['unit_of_measure'],
                'last_updated'        => $r['last_updated'],
            ];
        }, $items);
    }

    /**
     * Detailed orders list within date range for export.
     */
    public static function getDetailedOrdersForExport(string $startDate, string $endDate): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT
                o.id,
                o.order_number,
                o.source,
                o.order_type,
                o.subtotal,
                o.packaging_fee,
                o.total,
                o.payment_method,
                o.payment_status,
                o.order_status,
                o.created_at,
                COALESCE(u.full_name, o.guest_name, "Walk-in Customer") AS customer_name,
                c.full_name AS cashier_name
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            WHERE o.created_at >= :start AND o.created_at <= :end
            ORDER BY o.created_at DESC
        ');
        $stmt->execute(['start' => $startDate, 'end' => $endDate]);
        return $stmt->fetchAll();
    }

    /**
     * Cashier performance and shift reconciliation report.
     */
    public static function getCashierPerformance(?string $startDate = null, ?string $endDate = null): array
    {
        $db = Database::getConnection();

        $sql = '
            SELECT
                o.cashier_id,
                COALESCE(u.full_name, "Unassigned / Web") AS cashier_name,
                COUNT(o.id) AS orders_count,
                COALESCE(SUM(o.total), 0.00) AS total_sales,
                COALESCE(AVG(o.total), 0.00) AS avg_order_value,
                COUNT(CASE WHEN o.payment_method = "cash" THEN 1 END) AS cash_orders,
                COALESCE(SUM(CASE WHEN o.payment_method = "cash" THEN o.total ELSE 0 END), 0.00) AS cash_sales,
                COUNT(CASE WHEN o.payment_method = "pos" THEN 1 END) AS pos_orders,
                COALESCE(SUM(CASE WHEN o.payment_method = "pos" THEN o.total ELSE 0 END), 0.00) AS pos_sales,
                COUNT(CASE WHEN o.payment_method = "transfer" THEN 1 END) AS transfer_orders,
                COALESCE(SUM(CASE WHEN o.payment_method = "transfer" THEN o.total ELSE 0 END), 0.00) AS transfer_sales
            FROM orders o
            LEFT JOIN users u ON o.cashier_id = u.id
            WHERE o.payment_status = "paid"
        ';
        $params = [];

        if ($startDate !== null && $endDate !== null) {
            $sql .= ' AND o.created_at >= :start AND o.created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }

        $sql .= ' GROUP BY o.cashier_id, u.full_name ORDER BY total_sales DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function ($row) {
            return [
                'cashier_id'      => $row['cashier_id'] ? (int) $row['cashier_id'] : null,
                'cashier_name'    => $row['cashier_name'],
                'orders_count'    => (int) $row['orders_count'],
                'total_sales'     => (float) $row['total_sales'],
                'avg_order_value' => (float) $row['avg_order_value'],
                'cash_orders'     => (int) $row['cash_orders'],
                'cash_sales'      => (float) $row['cash_sales'],
                'pos_orders'      => (int) $row['pos_orders'],
                'pos_sales'       => (float) $row['pos_sales'],
                'transfer_orders' => (int) $row['transfer_orders'],
                'transfer_sales'  => (float) $row['transfer_sales'],
            ];
        }, $rows);
    }

    /**
     * Paginated transaction ledger report. Supports unlimited ($limit <= 0) for complete exports.
     */
    public static function getTransactionLedger(
        int $limit = 50,
        int $offset = 0,
        ?string $startDate = null,
        ?string $endDate = null,
        ?string $paymentMethod = null
    ): array {
        $db = Database::getConnection();

        $where = ['1=1'];
        $params = [];

        if ($startDate !== null && $endDate !== null) {
            $where[] = 't.created_at >= :start AND t.created_at <= :end';
            $params['start'] = $startDate;
            $params['end'] = $endDate;
        }

        if ($paymentMethod !== null && $paymentMethod !== '') {
            $where[] = 't.payment_method = :method';
            $params['method'] = $paymentMethod;
        }

        $whereClause = implode(' AND ', $where);

        // Count total
        $countStmt = $db->prepare("SELECT COUNT(t.id) FROM transactions t WHERE {$whereClause}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Query rows
        $sql = "
            SELECT
                t.id,
                t.transaction_reference,
                t.amount,
                t.payment_method,
                t.payment_status,
                t.provider,
                t.verified_at,
                t.created_at,
                o.order_number,
                o.source AS order_source,
                o.order_type,
                o.order_status,
                o.subtotal,
                o.packaging_fee,
                o.total AS order_total,
                COALESCE(u.full_name, o.guest_name, 'Walk-in / Guest') AS customer_name,
                u.email AS customer_email,
                u.phone AS customer_phone,
                c.full_name AS cashier_name
            FROM transactions t
            JOIN orders o ON t.order_id = o.id
            LEFT JOIN users u ON o.customer_id = u.id
            LEFT JOIN users c ON o.cashier_id = c.id
            WHERE {$whereClause}
            ORDER BY t.created_at DESC
        ";

        if ($limit > 0) {
            $sql .= " LIMIT :limit OFFSET :offset";
        }

        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue(':' . $key, $val);
        }
        if ($limit > 0) {
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        }
        $stmt->execute();

        $rows = $stmt->fetchAll();

        return [
            'data' => array_map(function ($r) {
                return [
                    'id'                    => (int) $r['id'],
                    'transaction_reference' => $r['transaction_reference'],
                    'amount'                => (float) $r['amount'],
                    'payment_method'        => $r['payment_method'],
                    'payment_status'        => $r['payment_status'],
                    'provider'              => $r['provider'] ?? 'Internal POS',
                    'verified_at'           => $r['verified_at'],
                    'created_at'            => $r['created_at'],
                    'order_number'          => $r['order_number'],
                    'order_source'          => $r['order_source'],
                    'order_type'            => $r['order_type'] ?? 'takeaway',
                    'order_status'          => $r['order_status'] ?? 'completed',
                    'subtotal'              => (float) ($r['subtotal'] ?? 0),
                    'packaging_fee'         => (float) ($r['packaging_fee'] ?? 0),
                    'order_total'           => (float) ($r['order_total'] ?? $r['amount']),
                    'customer_name'         => $r['customer_name'] ?? 'Walk-in / Guest',
                    'customer_email'        => $r['customer_email'],
                    'customer_phone'        => $r['customer_phone'] ?? null,
                    'cashier_name'          => $r['cashier_name'] ?? 'Online / System',
                ];
            }, $rows),
            'total' => $total,
        ];
    }

    /**
     * Get takeaway packaging revenue and volume metrics within date range.
     */
    public static function getPackagingReport(string $startDate, string $endDate): array
    {
        $db = Database::getConnection();

        // 1. Aggregates for paid orders
        $aggStmt = $db->prepare('
            SELECT
                COALESCE(SUM(packaging_quantity), 0) AS total_packs_sold,
                COALESCE(SUM(packaging_fee), 0.00) AS total_packaging_revenue,
                COUNT(CASE WHEN packaging_quantity > 0 THEN 1 END) AS orders_with_packaging,
                COALESCE(AVG(CASE WHEN packaging_quantity > 0 THEN packaging_quantity END), 0.0) AS avg_packs_per_order
            FROM orders
            WHERE payment_status = "paid"
              AND created_at >= :start AND created_at <= :end
        ');
        $aggStmt->execute(['start' => $startDate, 'end' => $endDate]);
        $summary = $aggStmt->fetch() ?: [];

        // 2. Daily trend
        $trendStmt = $db->prepare('
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(packaging_quantity), 0) AS packs_sold,
                COALESCE(SUM(packaging_fee), 0.00) AS packaging_revenue
            FROM orders
            WHERE payment_status = "paid"
              AND created_at >= :start AND created_at <= :end
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ');
        $trendStmt->execute(['start' => $startDate, 'end' => $endDate]);
        $trend = $trendStmt->fetchAll();

        return [
            'summary' => [
                'total_packs_sold'        => (int) ($summary['total_packs_sold'] ?? 0),
                'total_packaging_revenue' => (float) ($summary['total_packaging_revenue'] ?? 0.00),
                'orders_with_packaging'   => (int) ($summary['orders_with_packaging'] ?? 0),
                'avg_packs_per_order'     => round((float) ($summary['avg_packs_per_order'] ?? 0.0), 1),
            ],
            'trend'   => array_map(fn($r) => [
                'date'              => $r['date'],
                'packs_sold'        => (int) $r['packs_sold'],
                'packaging_revenue' => (float) $r['packaging_revenue'],
            ], $trend),
        ];
    }
}
