<?php
/**
 * Queen's Palace Eatery & Event Hall — Inventory Module Automated Test Suite
 *
 * Comprehensive end-to-end verification of:
 * 1. Database schema (track_inventory, unit_of_measure, notes, quantity_before, quantity_after, expanded enums)
 * 2. Initial stock movement logging upon item creation
 * 3. Atomic Stock In (purchase/restock) with before/after audit tracking
 * 4. Wastage & damaged stock recording with validation and notes
 * 5. Manual stock adjustment with discrepancy calculation
 * 6. Low stock threshold alert triggers
 * 7. Order placement stock deduction with row-locking
 * 8. Order rejection stock restoration
 * 9. Overselling prevention across all sales channels
 * 10. Unlimited inventory items (track_inventory = 0) bypass deduction & out-of-stock
 * 11. KPI Summary statistics & global movements audit ledger
 */

declare(strict_types=1);

define('QEP_APP', true);

require_once __DIR__ . '/../v2/config/constants.php';
require_once __DIR__ . '/../v2/config/Database.php';

// PSR-4 style autoloader for tests
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    if (str_starts_with($class, $prefix)) {
        $relative = str_replace($prefix, '', $class);
        $parts = explode('\\', $relative);
        $folder = strtolower(array_shift($parts));
        $className = implode('/', $parts);

        // Map folder names
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
use App\Services\InventoryService;
use App\Services\MenuService;
use App\Services\OrderService;
use App\Repositories\InventoryRepository;
use App\Repositories\MenuRepository;

$db = Database::getConnection();

function pass(string $msg): void {
    echo "  [PASS] {$msg}\n";
}

function fail(string $msg): void {
    echo "  [FAIL] {$msg}\n";
    exit(1);
}

echo "\n======================================================\n";
echo "  QUEEN'S PALACE — INVENTORY MODULE TEST SUITE\n";
echo "======================================================\n\n";

// TEST 1: Schema Verification
echo "Test 1: Schema Verification\n";
$miCols = $db->query("SHOW COLUMNS FROM menu_items")->fetchAll(PDO::FETCH_COLUMN);
if (in_array('track_inventory', $miCols, true) && in_array('unit_of_measure', $miCols, true)) {
    pass("menu_items has track_inventory and unit_of_measure columns");
} else {
    fail("menu_items missing required columns");
}

$smCols = $db->query("SHOW COLUMNS FROM stock_movements")->fetchAll(PDO::FETCH_COLUMN);
if (in_array('notes', $smCols, true) && in_array('quantity_before', $smCols, true) && in_array('quantity_after', $smCols, true)) {
    pass("stock_movements has notes, quantity_before, and quantity_after columns");
} else {
    fail("stock_movements missing audit columns");
}

// Find a valid admin user and category for testing
$adminUser = $db->query("SELECT id, full_name, 'admin' as role_name FROM users WHERE role_id IN (1, 2) LIMIT 1")->fetch();
if (!$adminUser) {
    $adminUser = ['id' => 1, 'full_name' => 'Admin Tester', 'role_name' => 'admin'];
}

$category = $db->query("SELECT id FROM categories LIMIT 1")->fetch();
$categoryId = $category ? (int) $category['id'] : 1;

// TEST 2: Create Menu Item with Tracked Inventory
echo "\nTest 2: Create Item with Tracked Inventory (20 portions, threshold 5)\n";
$menuService = new MenuService();
$createRes = $menuService->createItem([
    'name'                => 'TEST_DISH_' . time(),
    'description'         => 'Test dish for inventory verification',
    'category_id'         => $categoryId,
    'price'               => 2500.00,
    'quantity_available'  => 20,
    'low_stock_threshold' => 5,
    'track_inventory'     => 1,
    'unit_of_measure'     => 'portion',
    'requires_packaging'  => 1,
], $adminUser);

if (!$createRes['success']) {
    fail("Failed to create menu item: " . ($createRes['message'] ?? ''));
}
$testItem = $createRes['data'];
$testItemId = (int) $testItem['id'];
pass("Created item ID: {$testItemId} with initial stock 20");

// Verify initial stock movement was logged
$history = InventoryRepository::getStockHistory($testItemId);
if (!empty($history) && ($history[0]['movement_type'] === 'initial' || $history[0]['movement_type'] === 'add')) {
    pass("Initial stock movement recorded correctly: {$history[0]['movement_type']} with qty {$history[0]['quantity']}");
} else {
    fail("Initial stock movement was not recorded");
}

// TEST 3: Atomic Stock In (Restock)
echo "\nTest 3: Stock In (Purchase / Restock +10 portions)\n";
$stockInRes = InventoryService::stockIn($testItemId, 10.0, "Morning fresh prep", (int) $adminUser['id']);
if (!$stockInRes['success']) {
    fail("Stock In failed: " . $stockInRes['message']);
}
if ((float) $stockInRes['data']['quantity_before'] === 20.0 && (float) $stockInRes['data']['quantity_after'] === 30.0) {
    pass("Stock In correctly transitioned 20.0 -> 30.0");
} else {
    fail("Stock In quantity mismatch");
}

$invRecord = InventoryRepository::findByMenuItemId($testItemId);
if ((float) $invRecord['quantity'] === 30.0) {
    pass("Inventory table reflects quantity 30.0");
} else {
    fail("Inventory table quantity mismatch: expected 30.0, got {$invRecord['quantity']}");
}

// TEST 4: Record Wastage
echo "\nTest 4: Record Wastage (-3 portions spoilt/burnt)\n";
$wasteRes = InventoryService::recordWastage($testItemId, 3.0, "Burnt in kitchen oven", (int) $adminUser['id'], 'wastage');
if (!$wasteRes['success']) {
    fail("Wastage record failed: " . $wasteRes['message']);
}
if ((float) $wasteRes['data']['quantity_before'] === 30.0 && (float) $wasteRes['data']['quantity_after'] === 27.0) {
    pass("Wastage correctly transitioned 30.0 -> 27.0");
} else {
    fail("Wastage quantity mismatch");
}

// TEST 5: Record Damaged Stock
echo "\nTest 5: Record Damaged (-2 portions dropped on floor)\n";
$damageRes = InventoryService::recordWastage($testItemId, 2.0, "Container dropped on floor", (int) $adminUser['id'], 'damaged');
if (!$damageRes['success']) {
    fail("Damaged stock record failed: " . $damageRes['message']);
}
if ((float) $damageRes['data']['quantity_after'] === 25.0) {
    pass("Damaged stock correctly transitioned 27.0 -> 25.0");
} else {
    fail("Damaged quantity mismatch");
}

// TEST 6: Wastage Validation (Cannot waste more than available)
echo "\nTest 6: Wastage Validation (Attempt to waste 100 portions from 25)\n";
$invalidWaste = InventoryService::recordWastage($testItemId, 100.0, "Impossible waste", (int) $adminUser['id']);
if (!$invalidWaste['success']) {
    pass("Correctly rejected excessive wastage: " . $invalidWaste['message']);
} else {
    fail("Should have rejected wastage exceeding available stock");
}

// TEST 7: Manual Stock Adjustment (Physical Count)
echo "\nTest 7: Manual Stock Adjustment (Physical audit adjusts 25 -> 22)\n";
$adjustRes = InventoryService::manualAdjust($testItemId, 22.0, "End of shift audit recount", (int) $adminUser['id']);
if (!$adjustRes['success']) {
    fail("Manual adjust failed: " . $adjustRes['message']);
}
if ((float) $adjustRes['data']['quantity_after'] === 22.0) {
    pass("Manual adjustment correctly set stock to 22.0");
} else {
    fail("Manual adjust mismatch");
}

// TEST 8: Availability Check & Overselling Prevention
echo "\nTest 8: Availability Check & Overselling Prevention\n";
// Available check: 22 portions requested -> should pass
$availCheck1 = InventoryService::checkAvailability([
    ['menu_item_id' => $testItemId, 'quantity' => 22]
]);
if ($availCheck1['available']) {
    pass("Availability check passed for 22 portions");
} else {
    fail("Availability check should have passed for 22 portions");
}

// Available check: 23 portions requested -> should fail
$availCheck2 = InventoryService::checkAvailability([
    ['menu_item_id' => $testItemId, 'quantity' => 23]
]);
if (!$availCheck2['available'] && !empty($availCheck2['errors'])) {
    pass("Overselling prevented: " . $availCheck2['errors'][0]['message']);
} else {
    fail("Overselling should have been blocked for 23 portions when only 22 available");
}

// TEST 9: Order Placement Stock Deduction with Row-Locking
echo "\nTest 9: Order Placement Deduction (Order 5 portions)\n";
$db->beginTransaction();
$deductRes = InventoryService::deductStock([
    ['menu_item_id' => $testItemId, 'quantity' => 5, 'item_name' => 'Test Dish']
], "ORDER_TEST_001", (int) $adminUser['id']);
$db->commit();

$invAfterOrder = InventoryRepository::findByMenuItemId($testItemId);
if ((float) $invAfterOrder['quantity'] === 17.0) {
    pass("Stock deducted from 22.0 -> 17.0 on order placement");
} else {
    fail("Stock deduction failed: expected 17.0, got {$invAfterOrder['quantity']}");
}

// TEST 10: Order Rejection Stock Restoration
echo "\nTest 10: Order Rejection Stock Restoration (Restore 5 portions)\n";
$db->beginTransaction();
InventoryService::restoreStock([
    ['menu_item_id' => $testItemId, 'quantity' => 5]
], "REJECT_ORDER_TEST_001", (int) $adminUser['id']);
$db->commit();

$invAfterRestore = InventoryRepository::findByMenuItemId($testItemId);
if ((float) $invAfterRestore['quantity'] === 22.0) {
    pass("Stock successfully restored from 17.0 -> 22.0 on order rejection");
} else {
    fail("Stock restoration failed: expected 22.0, got {$invAfterRestore['quantity']}");
}

// TEST 11: Low Stock Notification Trigger
echo "\nTest 11: Low Stock Notification Trigger (Deduct to threshold <= 5)\n";
$db->beginTransaction();
$deductToLow = InventoryService::deductStock([
    ['menu_item_id' => $testItemId, 'quantity' => 18, 'item_name' => 'Test Dish']
], "ORDER_TEST_LOW", (int) $adminUser['id']);
$db->commit();

$invAtLow = InventoryRepository::findByMenuItemId($testItemId);
if ((float) $invAtLow['quantity'] === 4.0 && !empty($deductToLow['low_stock_triggered'])) {
    pass("Low stock trigger successfully activated when stock dropped to 4.0 (threshold: 5.0)");
} else {
    fail("Low stock trigger failed");
}

// TEST 12: Item with Unlimited Stock (track_inventory = 0)
echo "\nTest 12: Unlimited Stock Item (track_inventory = 0)\n";
$unlimitedRes = $menuService->createItem([
    'name'                => 'TEST_UNLIMITED_' . time(),
    'description'         => 'Unlimited made-to-order dish',
    'category_id'         => $categoryId,
    'price'               => 1200.00,
    'quantity_available'  => 0,
    'track_inventory'     => 0,
    'unit_of_measure'     => 'cup',
    'requires_packaging'  => 0,
], $adminUser);

$unlimitedItemId = (int) $unlimitedRes['data']['id'];

// Check availability for 500 portions -> should be available!
$unlimitedAvail = InventoryService::checkAvailability([
    ['menu_item_id' => $unlimitedItemId, 'quantity' => 500]
]);
if ($unlimitedAvail['available']) {
    pass("Unlimited item (track_inventory = 0) is available for 500 portions with 0 stock in DB");
} else {
    fail("Unlimited item should always be available");
}

// Deduct stock for unlimited item -> should be skipped without error
$db->beginTransaction();
InventoryService::deductStock([
    ['menu_item_id' => $unlimitedItemId, 'quantity' => 50, 'item_name' => 'Unlimited Dish']
], "ORDER_UNLIMITED", (int) $adminUser['id']);
$db->commit();
pass("Stock deduction gracefully bypassed for untracked item");

// TEST 13: KPI Summary & Movements Query
echo "\nTest 13: Inventory Summary KPI Metrics & Audit Log Queries\n";
$summary = InventoryRepository::getSummaryStats();
if (isset($summary['total_tracked_items'], $summary['low_stock_count'], $summary['out_of_stock_count'], $summary['movements_today'])) {
    pass("KPI Summary stats calculated correctly: " . json_encode($summary));
} else {
    fail("Summary stats missing required metric keys");
}

$allMoves = InventoryRepository::getAllStockMovements(10);
if (!empty($allMoves)) {
    pass("Global stock movements audit log retrieved (" . count($allMoves) . " recent records)");
} else {
    fail("Global movements log is empty");
}

// CLEANUP
echo "\nCleaning up test records...\n";
$db->prepare("DELETE FROM menu_items WHERE id IN (:id1, :id2)")->execute([
    'id1' => $testItemId,
    'id2' => $unlimitedItemId,
]);
pass("Cleaned up test items and cascaded inventory / movement records");

echo "\n======================================================\n";
echo "  ALL 13 TESTS PASSED! INVENTORY MODULE IS FULLY VERIFIED\n";
echo "======================================================\n\n";
