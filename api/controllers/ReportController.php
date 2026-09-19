<?php
/**
 * Queen Eatery Palace - Report Controller
 * 
 * Generates aggregated analytical reports for sales, order workflows,
 * inventory stock metrics, and transaction ledgers.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use PDO;

class ReportController
{
    /**
     * Sales analysis report
     * GET /api/reports/sales
     */
    public function sales(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $db = Database::getConnection();

        // 1. Gross sales by day (last 30 days)
        $salesTrend = $db->query('
            SELECT DATE(created_at) as date, SUM(total) as total_sales, COUNT(id) as order_count
            FROM orders
            WHERE payment_status = "paid" AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ')->fetchAll();

        // 2. Sales by payment method
        $paymentMethods = $db->query('
            SELECT payment_method, SUM(amount) as total_amount, COUNT(id) as tx_count
            FROM transactions
            WHERE payment_status = "success"
            GROUP BY payment_method
        ')->fetchAll();

        // 3. Sales by category
        $categorySales = $db->query('
            SELECT c.name as category_name, SUM(oi.quantity * oi.unit_price) as total_sales, SUM(oi.quantity) as items_sold
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            JOIN categories c ON m.category_id = c.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.payment_status = "paid"
            GROUP BY c.id
            ORDER BY total_sales DESC
        ')->fetchAll();

        Response::success([
            'sales_trend'      => $salesTrend,
            'payment_methods'  => $paymentMethods,
            'category_sales'   => $categorySales
        ]);
    }

    /**
     * Orders metrics report
     * GET /api/reports/orders
     */
    public function orders(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $db = Database::getConnection();

        // 1. Order status splits
        $statusSplits = $db->query('
            SELECT order_status AS status, COUNT(id) as count
            FROM orders
            GROUP BY order_status
        ')->fetchAll();

        // 2. Order type breakdown
        $typeBreakdown = $db->query('
            SELECT order_type, COUNT(id) as count, SUM(total) as total_revenue
            FROM orders
            WHERE payment_status = "paid"
            GROUP BY order_type
        ')->fetchAll();

        // 3. Busy hour analysis
        $hourlyVolume = $db->query('
            SELECT HOUR(created_at) as hour, COUNT(id) as order_count
            FROM orders
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY HOUR(created_at)
            ORDER BY hour ASC
        ')->fetchAll();

        Response::success([
            'status_splits'  => $statusSplits,
            'type_breakdown' => $typeBreakdown,
            'hourly_volume'  => $hourlyVolume
        ]);
    }

    /**
     * Inventory valuation and status report
     * GET /api/reports/inventory
     */
    public function inventory(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $db = Database::getConnection();

        // 1. Inventory stock summary & valuation
        $summary = $db->query('
            SELECT 
                COUNT(i.id) as total_tracked_items,
                SUM(i.quantity) as total_items_stock,
                SUM(i.quantity * m.price) as total_inventory_value
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE m.status != "disabled"
        ')->fetch();

        // 2. Out of stock / Low stock items
        $lowStockItems = $db->query('
            SELECT m.name, i.quantity, i.low_stock_threshold
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE i.quantity <= i.low_stock_threshold AND m.status != "disabled"
            ORDER BY i.quantity ASC
        ')->fetchAll();

        Response::success([
            'summary'         => $summary,
            'low_stock_items' => $lowStockItems
        ]);
    }

    /**
     * Transactions financial ledger report
     * GET /api/reports/transactions
     */
    public function transactions(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $db = Database::getConnection();
        $txs = $db->query('
            SELECT t.*, o.order_number, u.full_name as customer_name
            FROM transactions t
            JOIN orders o ON t.order_id = o.id
            LEFT JOIN users u ON o.customer_id = u.id
            ORDER BY t.created_at DESC
            LIMIT 100
        ')->fetchAll();

        foreach ($txs as &$tx) {
            $tx['amount'] = (float)$tx['amount'];
        }

        Response::success($txs);
    }
}
