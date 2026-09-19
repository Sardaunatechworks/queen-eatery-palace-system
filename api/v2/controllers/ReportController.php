<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Report Controller
 *
 * REST controller for analytical business intelligence,
 * sales volume, cashier shifts, inventory metrics, and CSV downloads.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Sanitizer;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\ReportService;

class ReportController
{
    /**
     * Sales analysis report.
     * GET /api/v2/reports/sales
     */
    public function sales(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $period = Sanitizer::string($_GET['period'] ?? 'month');
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;

        $data = ReportService::getSalesReport($period, $startDate, $endDate);
        Response::success($data);
    }

    /**
     * Order workflow metrics.
     * GET /api/v2/reports/orders
     */
    public function orders(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $period = Sanitizer::string($_GET['period'] ?? 'month');
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;

        $data = ReportService::getOrderMetrics($period, $startDate, $endDate);
        Response::success($data);
    }

    /**
     * Inventory valuation and low stock report.
     * GET /api/v2/reports/inventory
     */
    public function inventory(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireStaff();

        $data = ReportService::getInventoryReport();
        Response::success($data);
    }

    /**
     * Cashier performance and shifts.
     * GET /api/v2/reports/cashiers
     */
    public function cashiers(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $period = Sanitizer::string($_GET['period'] ?? 'month');
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;

        $data = ReportService::getCashierPerformance($period, $startDate, $endDate);
        Response::success($data);
    }

    /**
     * Transactions financial ledger.
     * GET /api/v2/reports/transactions
     */
    public function transactions(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $page = max(1, Sanitizer::int($_GET['page'] ?? 1));
        $perPage = min(100, max(1, Sanitizer::int($_GET['per_page'] ?? 50)));
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;
        $method = isset($_GET['payment_method']) ? Sanitizer::string($_GET['payment_method']) : null;

        $result = ReportService::getTransactionLedger($page, $perPage, $startDate, $endDate, $method);

        Response::paginated(
            $result['data'],
            $result['total'],
            $page,
            $perPage
        );
    }

    /**
     * Dedicated takeaway packaging metrics report.
     * GET /api/v2/reports/packaging
     */
    public function packaging(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $period = Sanitizer::string($_GET['period'] ?? 'month');
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;

        $data = ReportService::getPackagingReport($period, $startDate, $endDate);
        Response::success($data);
    }

    /**
     * Export report data as CSV file.
     * GET /api/v2/reports/export
     */
    public function export(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission(PERM_MANAGE_REPORTS);

        $type = Sanitizer::string($_GET['type'] ?? 'sales');
        $startDate = isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null;

        $csv = ReportService::generateCSV($type, $startDate, $endDate);

        $filename = "QEP_{$type}_report_" . date('Ymd_His') . ".csv";

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        echo $csv;
        exit;
    }
}
