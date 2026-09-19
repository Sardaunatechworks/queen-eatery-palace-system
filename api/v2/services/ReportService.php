<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Report Service
 *
 * Business logic layer for calculating financial analytics,
 * date-range normalization, percentage trends, and CSV export streaming.
 */

declare(strict_types=1);

namespace App\Services;

use App\Repositories\ReportRepository;

class ReportService
{
    /**
     * Parse date range from period name or custom start/end strings.
     *
     * @return array{start: string, end: string, label: string}
     */
    public static function parseDateRange(?string $period = 'month', ?string $customStart = null, ?string $customEnd = null): array
    {
        $now = time();

        if (!empty($customStart)) {
            $start = date('Y-m-d 00:00:00', strtotime($customStart));
            $end = !empty($customEnd) ? date('Y-m-d 23:59:59', strtotime($customEnd)) : date('Y-m-d 23:59:59', $now);
            return ['start' => $start, 'end' => $end, 'label' => 'Custom'];
        }

        switch (strtolower($period ?? 'month')) {
            case 'today':
                return [
                    'start' => date('Y-m-d 00:00:00', $now),
                    'end'   => date('Y-m-d 23:59:59', $now),
                    'label' => 'Today',
                ];

            case 'yesterday':
                $y = strtotime('-1 day', $now);
                return [
                    'start' => date('Y-m-d 00:00:00', $y),
                    'end'   => date('Y-m-d 23:59:59', $y),
                    'label' => 'Yesterday',
                ];

            case 'week':
                return [
                    'start' => date('Y-m-d 00:00:00', strtotime('monday this week', $now)),
                    'end'   => date('Y-m-d 23:59:59', $now),
                    'label' => 'This Week',
                ];

            case 'year':
                return [
                    'start' => date('Y-01-01 00:00:00', $now),
                    'end'   => date('Y-12-31 23:59:59', $now),
                    'label' => 'This Year',
                ];

            case 'all':
                return [
                    'start' => '2020-01-01 00:00:00',
                    'end'   => date('Y-m-d 23:59:59', $now),
                    'label' => 'All Time',
                ];

            case 'month':
            default:
                return [
                    'start' => date('Y-m-01 00:00:00', $now),
                    'end'   => date('Y-m-t 23:59:59', $now),
                    'label' => 'This Month',
                ];
        }
    }

    /**
     * Get dashboard overview metrics.
     */
    public static function getDashboardOverview(): array
    {
        return ReportRepository::getDashboardOverview();
    }

    /**
     * Comprehensive sales analysis report.
     */
    public static function getSalesReport(?string $period = 'month', ?string $customStart = null, ?string $customEnd = null): array
    {
        $range = self::parseDateRange($period, $customStart, $customEnd);
        $trend = ReportRepository::getSalesTrend($range['start'], $range['end']);
        $paymentMethods = ReportRepository::getSalesByPaymentMethod($range['start'], $range['end']);
        $categorySales = ReportRepository::getSalesByCategory($range['start'], $range['end']);
        $orderSources = ReportRepository::getSalesByOrderSource($range['start'], $range['end']);
        $packaging = ReportRepository::getPackagingReport($range['start'], $range['end']);

        // Summary calculations
        $totalSales = array_sum(array_column($trend, 'total_sales'));
        $totalOrders = array_sum(array_column($trend, 'order_count'));
        $avgTicket = $totalOrders > 0 ? $totalSales / $totalOrders : 0.00;
        $totalPackagingRevenue = $packaging['summary']['total_packaging_revenue'] ?? 0.00;
        $foodSales = max(0.00, round($totalSales - $totalPackagingRevenue, 2));

        return [
            'period'           => $range['label'],
            'start_date'       => $range['start'],
            'end_date'         => $range['end'],
            'summary'          => [
                'total_sales'             => round($totalSales, 2),
                'food_sales'              => $foodSales,
                'total_packaging_revenue' => $totalPackagingRevenue,
                'total_packs_sold'        => $packaging['summary']['total_packs_sold'] ?? 0,
                'order_count'             => $totalOrders,
                'avg_ticket'              => round($avgTicket, 2),
                'top_category'            => $categorySales[0]['category_name'] ?? 'N/A',
            ],
            'sales_trend'      => $trend,
            'payment_methods'  => $paymentMethods,
            'category_sales'   => $categorySales,
            'order_sources'    => $orderSources,
            'packaging'        => $packaging,
        ];
    }

    /**
     * Dedicated takeaway packaging charges and volume report.
     */
    public static function getPackagingReport(?string $period = 'month', ?string $customStart = null, ?string $customEnd = null): array
    {
        $range = self::parseDateRange($period, $customStart, $customEnd);
        $data = ReportRepository::getPackagingReport($range['start'], $range['end']);

        return array_merge([
            'period'     => $range['label'],
            'start_date' => $range['start'],
            'end_date'   => $range['end'],
        ], $data);
    }

    /**
     * Comprehensive order metrics report.
     */
    public static function getOrderMetrics(?string $period = 'month', ?string $customStart = null, ?string $customEnd = null): array
    {
        $range = self::parseDateRange($period, $customStart, $customEnd);
        $metrics = ReportRepository::getOrderMetrics($range['start'], $range['end']);

        return array_merge([
            'period'     => $range['label'],
            'start_date' => $range['start'],
            'end_date'   => $range['end'],
        ], $metrics);
    }

    /**
     * Inventory valuation and stock health report.
     */
    public static function getInventoryReport(): array
    {
        $val = ReportRepository::getInventoryValuation();
        $val['all_items'] = ReportRepository::getAllInventoryValuation();
        return $val;
    }

    /**
     * Cashier performance analysis.
     */
    public static function getCashierPerformance(?string $period = 'month', ?string $customStart = null, ?string $customEnd = null): array
    {
        $range = self::parseDateRange($period, $customStart, $customEnd);
        $data = ReportRepository::getCashierPerformance($range['start'], $range['end']);

        return [
            'period'     => $range['label'],
            'start_date' => $range['start'],
            'end_date'   => $range['end'],
            'cashiers'   => $data,
        ];
    }

    /**
     * Paginated transaction ledger report.
     */
    public static function getTransactionLedger(
        int $page = 1,
        int $perPage = 50,
        ?string $startDate = null,
        ?string $endDate = null,
        ?string $paymentMethod = null
    ): array {
        $offset = ($page - 1) * $perPage;
        return ReportRepository::getTransactionLedger($perPage, $offset, $startDate, $endDate, $paymentMethod);
    }

    /**
     * Generate enriched CSV file content for export regardless of transaction amount.
     */
    public static function generateCSV(string $type, ?string $startDate = null, ?string $endDate = null): string
    {
        $out = fopen('php://memory', 'w');

        // Write UTF-8 BOM for flawless rendering in Excel and spreadsheets
        fputs($out, "\xEF\xBB\xBF");

        switch ($type) {
            case 'inventory':
                fputcsv($out, [
                    'Item ID',
                    'Item Name',
                    'Category',
                    'Unit of Measure',
                    'Price (NGN)',
                    'Current Stock Quantity',
                    'Low Stock Threshold',
                    'Stock Status',
                    'Stock Valuation (NGN)',
                    'Track Inventory',
                    'Last Updated',
                ]);
                $items = ReportRepository::getAllInventoryValuation();
                $totalStockValuation = 0.0;
                $totalStockItems = 0;
                foreach ($items as $item) {
                    $totalStockValuation += (float) $item['stock_value'];
                    $totalStockItems += (int) $item['quantity'];
                    fputcsv($out, [
                        $item['menu_item_id'],
                        $item['name'],
                        $item['category_name'],
                        $item['unit_of_measure'],
                        number_format((float) $item['price'], 2, '.', ''),
                        $item['quantity'],
                        $item['low_stock_threshold'],
                        $item['stock_status'],
                        number_format((float) $item['stock_value'], 2, '.', ''),
                        $item['track_inventory'] ? 'Yes' : 'No',
                        $item['last_updated'] ?? 'N/A',
                    ]);
                }
                // Summary row
                fputcsv($out, [
                    'TOTAL',
                    'TOTAL VALUATION',
                    '',
                    '',
                    '',
                    $totalStockItems,
                    '',
                    '',
                    number_format($totalStockValuation, 2, '.', ''),
                    '',
                    '',
                ]);
                break;

            case 'orders':
            case 'sales_detailed':
                fputcsv($out, [
                    'Order ID',
                    'Order Number',
                    'Date & Time',
                    'Source',
                    'Order Type',
                    'Customer Name',
                    'Cashier / Staff',
                    'Subtotal (NGN)',
                    'Packaging Fee (NGN)',
                    'Total Amount (NGN)',
                    'Payment Method',
                    'Payment Status',
                    'Order Status',
                ]);
                $range = self::parseDateRange('month', $startDate, $endDate);
                $orders = ReportRepository::getDetailedOrdersForExport($range['start'], $range['end']);
                $totalRevenue = 0.0;
                $totalPackaging = 0.0;
                foreach ($orders as $ord) {
                    $totalRevenue += (float) ($ord['total'] ?? 0);
                    $totalPackaging += (float) ($ord['packaging_fee'] ?? 0);
                    fputcsv($out, [
                        $ord['id'],
                        $ord['order_number'],
                        $ord['created_at'],
                        ucfirst($ord['source'] ?? 'cashier'),
                        ucfirst($ord['order_type'] ?? 'takeaway'),
                        $ord['customer_name'] ?? 'Walk-in Customer',
                        $ord['cashier_name'] ?? 'Self / Online',
                        number_format((float) ($ord['subtotal'] ?? 0), 2, '.', ''),
                        number_format((float) ($ord['packaging_fee'] ?? 0), 2, '.', ''),
                        number_format((float) ($ord['total'] ?? 0), 2, '.', ''),
                        strtoupper($ord['payment_method'] ?? 'CASH'),
                        ucfirst($ord['payment_status'] ?? 'paid'),
                        ucfirst($ord['order_status'] ?? 'completed'),
                    ]);
                }
                fputcsv($out, [
                    'TOTAL',
                    count($orders) . ' Orders',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    number_format($totalPackaging, 2, '.', ''),
                    number_format($totalRevenue, 2, '.', ''),
                    '',
                    '',
                    '',
                ]);
                break;

            case 'sales':
                fputcsv($out, [
                    'Date',
                    'Gross Revenue (NGN)',
                    'Total Orders',
                    'Average Order Value (NGN)',
                ]);
                $range = self::parseDateRange('month', $startDate, $endDate);
                $rows = ReportRepository::getSalesTrend($range['start'], $range['end']);
                $totalSales = 0.0;
                $totalOrders = 0;
                foreach ($rows as $r) {
                    $totalSales += (float) $r['total_sales'];
                    $totalOrders += (int) $r['order_count'];
                    fputcsv($out, [
                        $r['date'],
                        number_format((float) $r['total_sales'], 2, '.', ''),
                        $r['order_count'],
                        number_format((float) $r['avg_order_value'], 2, '.', ''),
                    ]);
                }
                $avgOverall = $totalOrders > 0 ? $totalSales / $totalOrders : 0.0;
                fputcsv($out, [
                    'TOTAL / AVERAGE',
                    number_format($totalSales, 2, '.', ''),
                    $totalOrders,
                    number_format($avgOverall, 2, '.', ''),
                ]);
                break;

            case 'transactions':
            default:
                fputcsv($out, [
                    'Transaction ID',
                    'Reference',
                    'Order Number',
                    'Date & Time',
                    'Customer Name',
                    'Customer Email',
                    'Customer Phone',
                    'Cashier / Staff',
                    'Order Source',
                    'Order Type',
                    'Subtotal (NGN)',
                    'Packaging Fee (NGN)',
                    'Total Amount (NGN)',
                    'Payment Method',
                    'Payment Status',
                    'Provider',
                    'Order Status',
                ]);
                $range = self::parseDateRange('month', $startDate, $endDate);
                // Passing 0 limit fetches ALL matching transactions without 500 cap
                $res = ReportRepository::getTransactionLedger(0, 0, $range['start'], $range['end']);
                $totalTxAmount = 0.0;
                foreach ($res['data'] as $tx) {
                    $totalTxAmount += (float) $tx['amount'];
                    fputcsv($out, [
                        $tx['id'],
                        $tx['transaction_reference'],
                        $tx['order_number'],
                        $tx['created_at'],
                        $tx['customer_name'] ?? 'Walk-in / Guest',
                        $tx['customer_email'] ?? 'N/A',
                        $tx['customer_phone'] ?? 'N/A',
                        $tx['cashier_name'] ?? 'Online / System',
                        ucfirst($tx['order_source'] ?? 'cashier'),
                        ucfirst($tx['order_type'] ?? 'takeaway'),
                        number_format((float) ($tx['subtotal'] ?? 0), 2, '.', ''),
                        number_format((float) ($tx['packaging_fee'] ?? 0), 2, '.', ''),
                        number_format((float) $tx['amount'], 2, '.', ''),
                        strtoupper($tx['payment_method'] ?? 'CASH'),
                        ucfirst($tx['payment_status'] ?? 'completed'),
                        $tx['provider'] ?? 'Internal POS',
                        ucfirst($tx['order_status'] ?? 'completed'),
                    ]);
                }
                fputcsv($out, [
                    'TOTAL',
                    count($res['data']) . ' Transactions',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    number_format($totalTxAmount, 2, '.', ''),
                    '',
                    '',
                    '',
                    '',
                ]);
                break;
        }

        fseek($out, 0);
        $csv = stream_get_contents($out);
        fclose($out);

        return $csv !== false ? $csv : '';
    }
}
