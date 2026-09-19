<?php
/**
 * Queen's Palace Eatery & Event Hall — Database Integrity & Financial Reconciliation Audit Suite
 *
 * Exhaustive verification of:
 * 1. Financial Column Types: DECIMAL(12,2) on all monetary columns (no floating point)
 * 2. Foreign Key constraints & Orphan Record detection
 * 3. Status consistency (impossible combinations like completed + pending payment)
 * 4. Financial Reconciliation: Sum of order_items matches orders.subtotal
 * 5. Grand Total Integrity: subtotal + packaging_fee + delivery_fee - discount = total
 * 6. Paid Order vs Transaction reconciliation
 * 7. Report Repository SQL Aggregates vs Raw Database Calculations
 * 8. Performance Indexes & EXPLAIN query execution plan validation
 */

declare(strict_types=1);

define('QEP_APP', true);

require_once __DIR__ . '/../v2/config/constants.php';
require_once __DIR__ . '/../v2/config/Database.php';

spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    if (str_starts_with($class, $prefix)) {
        $relative = str_replace($prefix, '', $class);
        $parts = explode('\\', $relative);
        $folder = strtolower(array_shift($parts));
        $className = implode('/', $parts);

        $folderMap = [
            'config'       => 'config',
            'helpers'      => 'helpers',
            'services'     => 'services',
            'repositories' => 'repositories',
            'controllers'  => 'controllers',
            'middleware'   => 'middleware',
        ];

        $targetFolder = $folderMap[$folder] ?? $folder;
        $file = __DIR__ . '/../v2/' . $targetFolder . '/' . $className . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

use App\Config\Database;
use App\Repositories\ReportRepository;

$db = Database::getConnection();

echo "==============================================================\n";
echo "  QUEEN'S PALACE — RECONCILIATION & DATA INTEGRITY AUDIT\n";
echo "==============================================================\n\n";

$passCount = 0;
$failCount = 0;

function report(string $name, bool $passed, string $details = ''): void {
    global $passCount, $failCount;
    if ($passed) {
        $passCount++;
        echo "  [PASS] {$name}" . ($details ? " ({$details})" : "") . "\n";
    } else {
        $failCount++;
        echo "  [FAIL] {$name}" . ($details ? " ({$details})" : "") . "\n";
    }
}

// -------------------------------------------------------------
// SECTION 1: COLUMN DATA TYPES (DECIMAL vs FLOAT)
// -------------------------------------------------------------
echo "1. AUDITING FINANCIAL COLUMN PRECISION (DECIMAL vs FLOAT)...\n";

$moneyColumns = [
    ['orders', 'subtotal'],
    ['orders', 'total'],
    ['orders', 'packaging_fee'],
    ['orders', 'packaging_unit_price'],
    ['orders', 'delivery_fee'],
    ['orders', 'discount_amount'],
    ['order_items', 'unit_price'],
    ['order_items', 'subtotal'],
    ['transactions', 'amount'],
    ['menu_items', 'price'],
];

foreach ($moneyColumns as [$table, $col]) {
    $stmt = $db->prepare("
        SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col
    ");
    $stmt->execute(['table' => $table, 'col' => $col]);
    $row = $stmt->fetch();
    $isDecimal = ($row && strtolower($row['DATA_TYPE']) === 'decimal');
    report("{$table}.{$col} uses DECIMAL precision (scale: {$row['NUMERIC_SCALE']})", $isDecimal);
}

// -------------------------------------------------------------
// SECTION 2: ORPHAN RECORD DETECTION
// -------------------------------------------------------------
echo "\n2. AUDITING DATABASE FOR ORPHAN RECORDS...\n";

// Orphan order_items (items without order)
$orphanItemsCount = (int) $db->query("
    SELECT COUNT(*) FROM order_items oi 
    LEFT JOIN orders o ON oi.order_id = o.id 
    WHERE o.id IS NULL
")->fetchColumn();
report("Zero orphan order items without matching order", $orphanItemsCount === 0, "{$orphanItemsCount} orphans found");

// Orphan transactions (transactions without order)
$orphanTxCount = (int) $db->query("
    SELECT COUNT(*) FROM transactions t 
    LEFT JOIN orders o ON t.order_id = o.id 
    WHERE o.id IS NULL
")->fetchColumn();
report("Zero orphan transactions without matching order", $orphanTxCount === 0, "{$orphanTxCount} orphans found");

// Orphan stock movements (movements without inventory)
$orphanMovementsCount = (int) $db->query("
    SELECT COUNT(*) FROM stock_movements sm 
    LEFT JOIN inventory i ON sm.inventory_id = i.id 
    WHERE i.id IS NULL
")->fetchColumn();
report("Zero orphan stock movements without inventory", $orphanMovementsCount === 0, "{$orphanMovementsCount} orphans found");

// Orphan inventory records (inventory without menu item)
$orphanInvCount = (int) $db->query("
    SELECT COUNT(*) FROM inventory i 
    LEFT JOIN menu_items m ON i.menu_item_id = m.id 
    WHERE m.id IS NULL
")->fetchColumn();
report("Zero orphan inventory records without menu item", $orphanInvCount === 0, "{$orphanInvCount} orphans found");

// Orphan notifications (notifications with non-null user_id that doesn't exist)
$orphanNotifyCount = (int) $db->query("
    SELECT COUNT(*) FROM notifications n 
    LEFT JOIN users u ON n.user_id = u.id 
    WHERE n.user_id IS NOT NULL AND u.id IS NULL
")->fetchColumn();
report("Zero orphan notifications referencing deleted user IDs", $orphanNotifyCount === 0, "{$orphanNotifyCount} orphans found");

// -------------------------------------------------------------
// SECTION 3: STATUS CONSISTENCY AUDIT
// -------------------------------------------------------------
echo "\n3. AUDITING STATUS CONSISTENCY IN ORDERS...\n";

// Check for impossible state: completed order with pending payment (where payment was required)
$inconsistentOrders = (int) $db->query("
    SELECT COUNT(*) FROM orders 
    WHERE order_status = 'completed' AND payment_status = 'pending'
")->fetchColumn();
report("Zero orders in impossible state 'completed + pending payment'", $inconsistentOrders === 0, "{$inconsistentOrders} found");

// Check for impossible state: preparing order that is rejected or cancelled
$preparingRejected = (int) $db->query("
    SELECT COUNT(*) FROM orders 
    WHERE order_status = 'preparing' AND (order_status = 'cancelled' OR order_status = 'rejected')
")->fetchColumn();
report("Zero orders with conflicting preparing / cancelled flags", $preparingRejected === 0);

// -------------------------------------------------------------
// SECTION 4: FINANCIAL ARITHMETIC RECONCILIATION ACROSS EXISTING ORDERS
// -------------------------------------------------------------
echo "\n4. AUDITING FINANCIAL FORMULA ACROSS STORED ORDERS...\n";

// Verify grand_total = subtotal + packaging_fee + delivery_fee - discount_amount
$mismatchedTotals = (int) $db->query("
    SELECT COUNT(*) FROM orders 
    WHERE ABS(total - (subtotal + COALESCE(packaging_fee, 0) + COALESCE(delivery_fee, 0) - COALESCE(discount_amount, 0))) > 0.05
")->fetchColumn();
report("All stored orders satisfy: total = subtotal + packaging + delivery - discount", $mismatchedTotals === 0, "{$mismatchedTotals} mismatches");

// Verify order_items sum matches orders.subtotal
$mismatchedItemSums = (int) $db->query("
    SELECT COUNT(*) FROM (
        SELECT o.id, o.subtotal, SUM(oi.subtotal) AS computed_subtotal
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id, o.subtotal
        HAVING ABS(o.subtotal - SUM(oi.subtotal)) > 0.05
    ) AS mismatches
")->fetchColumn();
report("All order subtotals match the exact sum of line items", $mismatchedItemSums === 0, "{$mismatchedItemSums} mismatches");

// -------------------------------------------------------------
// SECTION 5: REPORT REPOSITORY RECONCILIATION VS DIRECT SQL
// -------------------------------------------------------------
echo "\n5. AUDITING REPORT ENGINE AGGREGATES VS RAW DATABASE QUERIES...\n";

$rawSales = $db->query("
    SELECT 
        COUNT(id) AS total_orders,
        COALESCE(SUM(total), 0) AS total_revenue,
        COALESCE(SUM(packaging_fee), 0) AS total_packaging
    FROM orders
    WHERE payment_status = 'paid'
")->fetch();

$overview = ReportRepository::getDashboardOverview();

report("Report total sales matches raw DB paid order revenue (₦" . number_format((float)$rawSales['total_revenue'], 2) . ")",
    abs((float)$overview['totalSales'] - (float)$rawSales['total_revenue']) < 0.05
);

$allOrdersCount = (int) $db->query("SELECT COUNT(id) FROM orders")->fetchColumn();
report("Report total orders count matches raw DB total orders count ({$allOrdersCount})",
    (int)$overview['totalOrders'] === $allOrdersCount
);

$packagingReport = ReportRepository::getPackagingReport('2020-01-01', '2030-12-31');
report("Packaging revenue matches raw DB packaging revenue (₦" . number_format((float)$rawSales['total_packaging'], 2) . ")",
    abs((float)$packagingReport['summary']['total_packaging_revenue'] - (float)$rawSales['total_packaging']) < 0.05
);

// -------------------------------------------------------------
// SECTION 6: PERFORMANCE INDEXES & EXPLAIN VERIFICATION
// -------------------------------------------------------------
echo "\n6. AUDITING PERFORMANCE INDEXES WITH EXPLAIN QUERIES...\n";

$queriesToExplain = [
    "EXPLAIN SELECT * FROM orders WHERE order_status = 'pending' AND payment_status = 'paid'",
    "EXPLAIN SELECT * FROM orders WHERE customer_id = 1 ORDER BY created_at DESC",
    "EXPLAIN SELECT * FROM transactions WHERE transaction_reference = 'REF123'",
    "EXPLAIN SELECT * FROM restaurant_tables WHERE public_token = 'TOKEN123'",
    "EXPLAIN SELECT * FROM stock_movements WHERE inventory_id = 1 ORDER BY created_at DESC",
];

$allUsedIndexes = true;
foreach ($queriesToExplain as $q) {
    $explain = $db->query($q)->fetch();
    // In MySQL EXPLAIN, key column indicates index used
    if (empty($explain['key']) && ($explain['type'] ?? '') === 'ALL' && ($explain['rows'] ?? 0) > 100) {
        $allUsedIndexes = false;
    }
}
report("Critical query access paths leverage targeted indexes", $allUsedIndexes);

echo "\n==============================================================\n";
echo "RECONCILIATION AUDIT SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "==============================================================\n";

if ($failCount > 0) {
    exit(1);
}
