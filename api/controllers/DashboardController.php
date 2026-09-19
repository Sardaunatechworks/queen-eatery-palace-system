<?php
/**
 * Queen Eatery Palace - Dashboard Controller
 * 
 * Provides aggregated counts and metrics for the admin overview control panel.
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
     * Get aggregate overview statistics for admin
     * GET /api/dashboard/overview
     */
    public function overview(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER);

        $db = Database::getConnection();

        // 1. Combined order aggregates (revenue, total orders, active orders) in 1 query
        $ordersAgg = $db->query('
            SELECT 
                COALESCE(SUM(CASE WHEN payment_status = "paid" THEN total ELSE 0 END), 0.00) AS totalSales,
                COUNT(id) AS totalOrders,
                COUNT(CASE WHEN order_status IN ("received", "preparing", "ready") THEN 1 END) AS activeOrders
            FROM orders
        ')->fetch();

        $totalSales   = (float)($ordersAgg['totalSales'] ?? 0.00);
        $totalOrders  = (int)($ordersAgg['totalOrders'] ?? 0);
        $activeOrders = (int)($ordersAgg['activeOrders'] ?? 0);

        // 2. Total customers count
        $customersStmt = $db->prepare('
            SELECT COUNT(u.id) FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE r.name = :role AND u.status != "deleted"
        ');
        $customersStmt->execute(['role' => ROLE_CUSTOMER]);
        $totalCustomers = (int)$customersStmt->fetchColumn() ?: 0;

        Response::success([
            'totalSales'     => $totalSales,
            'totalOrders'    => $totalOrders,
            'totalCustomers' => $totalCustomers,
            'activeOrders'   => $activeOrders
        ]);
    }
}
