<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Dashboard Controller
 *
 * Implements unified, high-performance summary endpoints for each role:
 * - Admin Dashboard: GET /api/v2/admin/dashboard
 * - Cashier Dashboard: GET /api/v2/cashier/dashboard
 * - Kitchen Dashboard: GET /api/v2/kitchen/dashboard
 * - Customer Dashboard: GET /api/v2/customer/dashboard
 *
 * Consolidates multiple waterfall API requests into a single database-optimized
 * JSON response (< 50ms) returning only fields necessary for initial render.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use PDO;

class DashboardController
{
    /**
     * Dashboard Overview Alias
     * GET /api/v2/dashboard/overview
     */
    public function overview(): void
    {
        $this->admin();
    }

    /**
     * Admin Dashboard Unified Summary Endpoint
     * GET /api/v2/admin/dashboard
     */
    public function admin(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole('super_admin', 'admin');

        $db = Database::getConnection();

        // 1. Single aggregated metrics query
        $today = date('Y-m-d 00:00:00');

        $metricsStmt = $db->query("
            SELECT
                COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS total_sales,
                COUNT(id) AS total_orders,
                COALESCE(SUM(CASE WHEN payment_status = 'paid' AND created_at >= '{$today}' THEN total ELSE 0 END), 0) AS today_sales,
                COALESCE(SUM(CASE WHEN created_at >= '{$today}' THEN 1 ELSE 0 END), 0) AS today_orders,
                COALESCE(SUM(CASE WHEN order_status IN ('pending', 'received', 'preparing', 'ready') THEN 1 ELSE 0 END), 0) AS active_orders
            FROM orders
        ");
        $metrics = $metricsStmt->fetch(PDO::FETCH_ASSOC);

        // Low stock count
        $lowStockCount = (int) $db->query("
            SELECT COUNT(id) FROM inventory WHERE quantity <= low_stock_threshold
        ")->fetchColumn();

        // Pending menu items proposed by kitchen waiting for admin review
        $pendingMenuCount = (int) $db->query("
            SELECT COUNT(id) FROM menu_items WHERE approval_status = 'pending'
        ")->fetchColumn();

        // Total customers count
        $totalCustomers = (int) $db->query("
            SELECT COUNT(u.id) 
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE r.name = 'customer' OR u.role_id = 4
        ")->fetchColumn();

        // 2. 7-day sales trend (SQL group by day)
        $sevenDaysAgo = date('Y-m-d 00:00:00', strtotime('-6 days'));
        $trendStmt = $db->prepare("
            SELECT 
                DATE(created_at) AS sale_date,
                COALESCE(SUM(total), 0) AS daily_sales,
                COUNT(id) AS order_count
            FROM orders
            WHERE created_at >= :since AND payment_status = 'paid'
            GROUP BY DATE(created_at)
            ORDER BY sale_date ASC
        ");
        $trendStmt->execute(['since' => $sevenDaysAgo]);
        $trendRows = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fill all 7 days even if 0 sales
        $salesTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $dateKey = date('Y-m-d', strtotime("-{$i} days"));
            $salesTrend[$dateKey] = [
                'date' => $dateKey,
                'total_sales' => 0.0,
                'order_count' => 0
            ];
        }
        foreach ($trendRows as $row) {
            if (isset($salesTrend[$row['sale_date']])) {
                $salesTrend[$row['sale_date']]['total_sales'] = (float) $row['daily_sales'];
                $salesTrend[$row['sale_date']]['order_count'] = (int) $row['order_count'];
            }
        }

        // 3. Recent 6 active orders (explicit columns only)
        $activeOrdersStmt = $db->query("
            SELECT 
                o.id,
                o.order_number,
                o.total AS total_amount,
                o.total,
                o.order_status,
                o.payment_status,
                o.order_type,
                o.delivery_address,
                o.created_at,
                u.full_name AS customer_name,
                u.phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.order_status IN ('pending', 'received', 'preparing', 'ready')
            ORDER BY o.created_at DESC
            LIMIT 6
        ");
        $activeOrders = $activeOrdersStmt->fetchAll(PDO::FETCH_ASSOC);

        // 4. Recent 5 transactions (explicit columns only)
        $txStmt = $db->query("
            SELECT 
                t.id,
                t.transaction_reference,
                t.order_id,
                t.amount,
                t.payment_method,
                t.payment_status,
                t.created_at,
                o.order_number
            FROM transactions t
            LEFT JOIN orders o ON t.order_id = o.id
            ORDER BY t.created_at DESC
            LIMIT 5
        ");
        $transactions = $txStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'overview' => [
                'totalSales'       => (float) $metrics['total_sales'],
                'totalOrders'      => (int) $metrics['total_orders'],
                'todaySales'       => (float) $metrics['today_sales'],
                'todayOrders'      => (int) $metrics['today_orders'],
                'activeOrders'     => (int) $metrics['active_orders'],
                'totalCustomers'   => $totalCustomers,
                'lowStockCount'    => $lowStockCount,
                'pendingMenuCount' => $pendingMenuCount,
            ],
            'salesTrend'   => array_values($salesTrend),
            'activeOrders' => $activeOrders,
            'transactions' => $transactions,
        ], 'Admin dashboard summary loaded');
    }

    /**
     * Cashier Dashboard Unified Summary Endpoint
     * GET /api/v2/cashier/dashboard
     */
    public function cashier(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole('super_admin', 'admin', 'cashier');

        $user = $_REQUEST['auth_user'] ?? [];
        $db = Database::getConnection();
        $today = date('Y-m-d 00:00:00');
        $userId = (int) ($user['id'] ?? 0);

        // Shift metrics
        $shiftStmt = $db->prepare("
            SELECT
                COALESCE(SUM(total), 0) AS shift_sales,
                COUNT(id) AS shift_orders
            FROM orders
            WHERE cashier_id = :cid AND created_at >= :today AND payment_status = 'paid'
        ");
        $shiftStmt->execute(['cid' => $userId, 'today' => $today]);
        $shift = $shiftStmt->fetch(PDO::FETCH_ASSOC);

        // Active orders for cashier queue
        $ordersStmt = $db->query("
            SELECT 
                o.id,
                o.order_number,
                o.total AS total_amount,
                o.total,
                o.order_status,
                o.payment_status,
                o.order_type,
                o.created_at,
                u.full_name AS customer_name
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.order_status IN ('pending', 'received', 'preparing', 'ready')
            ORDER BY o.created_at ASC
            LIMIT 20
        ");
        $activeOrders = $ordersStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fast categories
        $catsStmt = $db->query("
            SELECT id, name, sort_order
            FROM categories
            WHERE status = 'active'
            ORDER BY sort_order ASC
        ");
        $categories = $catsStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'shift' => [
                'sales'  => (float) ($shift['shift_sales'] ?? 0),
                'orders' => (int) ($shift['shift_orders'] ?? 0),
            ],
            'activeOrders' => $activeOrders,
            'categories'   => $categories,
        ], 'Cashier dashboard summary loaded');
    }

    /**
     * Kitchen Dashboard Unified Summary Endpoint
     * GET /api/v2/kitchen/dashboard
     */
    public function kitchen(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole('super_admin', 'admin', 'kitchen');

        $db = Database::getConnection();

        // 1. Fetch active preparing / received / queued / ready orders with customer info
        $ordersStmt = $db->query("
            SELECT 
                o.id,
                o.order_number,
                o.total AS total_amount,
                o.total,
                o.order_status,
                o.order_status AS status,
                o.payment_status,
                o.order_type,
                o.table_number,
                o.guest_name,
                o.delivery_address,
                o.notes,
                o.created_at,
                u.full_name AS customer_name
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.order_status IN ('submitted', 'pending', 'received', 'accepted', 'preparing', 'ready')
            ORDER BY 
                CASE o.order_status 
                    WHEN 'accepted' THEN 1 
                    WHEN 'received' THEN 2 
                    WHEN 'preparing' THEN 3 
                    WHEN 'submitted' THEN 4 
                    WHEN 'pending' THEN 5 
                    WHEN 'ready' THEN 6 
                    ELSE 7 
                END ASC,
                o.created_at ASC
            LIMIT 50
        ");
        $orders = $ordersStmt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Batch-load items for these orders
        if (!empty($orders)) {
            $orderIds = array_column($orders, 'id');
            $itemsBatch = \App\Repositories\OrderRepository::getOrderItemsBatch($orderIds);
            foreach ($orders as &$order) {
                $order['items'] = $itemsBatch[$order['id']] ?? [];
            }
        }

        // 3. Fast categories
        $catsStmt = $db->query("
            SELECT id, name, sort_order FROM categories WHERE status = 'active' ORDER BY sort_order ASC
        ");
        $categories = $catsStmt->fetchAll(PDO::FETCH_ASSOC);

        // 4. Live menu items with portion count
        $menuStmt = $db->query("
            SELECT 
                m.id,
                m.name,
                m.description,
                m.price,
                m.image_path AS image,
                m.status,
                m.approval_status,
                m.category_id,
                c.name AS category,
                COALESCE(i.quantity, m.quantity_available, 0) AS quantity_available,
                COALESCE(i.quantity, m.quantity_available, 0) AS stockQuantity,
                m.track_inventory
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            LEFT JOIN inventory i ON m.id = i.menu_item_id
            WHERE m.status != 'disabled' AND m.approval_status = 'approved'
            ORDER BY c.sort_order ASC, m.name ASC
        ");
        $menu = $menuStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'orders'     => $orders,
            'categories' => $categories,
            'menu'       => $menu,
        ], 'Kitchen dashboard summary loaded');
    }

    /**
     * Customer Dashboard Unified Summary Endpoint
     * GET /api/v2/customer/dashboard
     */
    public function customer(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'] ?? [];
        $userId = (int) ($user['id'] ?? 0);
        $db = Database::getConnection();

        // Active orders for this customer
        $activeStmt = $db->prepare("
            SELECT 
                id, order_number, total AS total_amount, total, order_status, payment_status,
                order_type, created_at
            FROM orders
            WHERE customer_id = :uid AND order_status IN ('pending', 'received', 'preparing', 'ready')
            ORDER BY created_at DESC
        ");
        $activeStmt->execute(['uid' => $userId]);
        $activeOrders = $activeStmt->fetchAll(PDO::FETCH_ASSOC);

        // Recent completed orders
        $recentStmt = $db->prepare("
            SELECT 
                id, order_number, total AS total_amount, total, order_status, payment_status,
                order_type, created_at
            FROM orders
            WHERE customer_id = :uid
            ORDER BY created_at DESC
            LIMIT 5
        ");
        $recentStmt->execute(['uid' => $userId]);
        $recentOrders = $recentStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'activeOrders' => $activeOrders,
            'recentOrders' => $recentOrders,
        ], 'Customer dashboard summary loaded');
    }
}
