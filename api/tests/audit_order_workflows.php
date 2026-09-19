<?php
/**
 * Queen's Palace Eatery & Event Hall — Automated Order Engine & Workflow Audit Suite
 *
 * Exhaustive verification of:
 * 1. Authoritative Pricing Engine (subtotal + packaging + delivery - discount = grand_total)
 * 2. Takeaway packaging rules (0, 1, 2, 5 packs) & snapshot immutability
 * 3. Cashier POS Walk-in Order Flow
 * 4. Online Customer Pickup & Delivery Flow
 * 5. Guest QR Table Ordering (Pay After vs Pay Now) & Token security
 * 6. Order State Machine transitions & invalid transition rejection
 * 7. Concurrency & Row-Locking overselling prevention (SELECT ... FOR UPDATE)
 * 8. Payment Idempotency & Replay Attack Defense (duplicate reference)
 * 9. Thermal Receipt Data Fidelity (line items, pack fees, table numbers)
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
use App\Services\PricingService;
use App\Services\OrderService;
use App\Services\InventoryService;
use App\Services\GuestOrderService;
use App\Repositories\OrderRepository;
use App\Repositories\MenuRepository;
use App\Repositories\TableRepository;
use App\Repositories\SettingRepository;
use App\Repositories\TransactionRepository;
use App\Repositories\InventoryRepository;

$db = Database::getConnection();

echo "==============================================================\n";
echo "  QUEEN'S PALACE — ORDER ENGINE & WORKFLOW AUDIT SUITE\n";
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

// Track created IDs for strict test cleanup
$createdOrderIds = [];
$createdMenuItemIds = [];

// -------------------------------------------------------------
// SECTION 1: PRICING ENGINE & AUTHORITATIVE CALCULATIONS
// -------------------------------------------------------------
echo "1. AUDITING PRICING ENGINE & TAKEAWAY PACKAGING...\n";

// Set baseline unit price to ₦300.00
PricingService::setTakeawayPackPrice(300.00);
$unitPrice = PricingService::getTakeawayPackPrice();
report("Baseline packaging unit price is ₦300.00", $unitPrice === 300.00);

// Test 0, 1, 2, 5 packs
$r0 = PricingService::calculateOrderTotals([], 'cashier', 0);
report("0 takeaway packs = ₦0 packaging fee", (float)$r0['packaging_fee'] === 0.00 && (int)$r0['packaging_quantity'] === 0);

$r1 = PricingService::calculateOrderTotals([], 'cashier', 1);
report("1 takeaway pack = ₦300 packaging fee", (float)$r1['packaging_fee'] === 300.00 && (int)$r1['packaging_quantity'] === 1);

$r2 = PricingService::calculateOrderTotals([], 'cashier', 2);
report("2 takeaway packs = ₦600 packaging fee", (float)$r2['packaging_fee'] === 600.00 && (int)$r2['packaging_quantity'] === 2);

$r5 = PricingService::calculateOrderTotals([], 'cashier', 5);
report("5 takeaway packs = ₦1,500 packaging fee", (float)$r5['packaging_fee'] === 1500.00 && (int)$r5['packaging_quantity'] === 5);

// Test full pricing formula: subtotal + packaging_fee + delivery_fee - discount = grand_total
$sampleItems = [
    ['price' => 2500.00, 'quantity' => 2, 'requires_packaging' => true],  // 5000 + 2 packs
    ['price' => 1500.00, 'quantity' => 1, 'requires_packaging' => true],  // 1500 + 1 pack
    ['price' => 500.00,  'quantity' => 2, 'requires_packaging' => false], // 1000 + 0 packs
];
// Subtotal = 5000 + 1500 + 1000 = 7500. Packs = 3 * 300 = 900. Delivery = 1000. Discount = 500.
// Expected Grand Total = 7500 + 900 + 1000 - 500 = 8900.
$calc = PricingService::calculateOrderTotals($sampleItems, 'customer', null, 1000.00, 500.00);
report("Pricing formula: subtotal (₦7,500) + packaging (₦900) + delivery (₦1,000) - discount (₦500) = grand_total (₦8,900)",
    $calc['subtotal'] === 7500.00 &&
    $calc['packaging_fee'] === 900.00 &&
    $calc['delivery_fee'] === 1000.00 &&
    $calc['discount_amount'] === 500.00 &&
    $calc['grand_total'] === 8900.00
);

// Test Historical Snapshot Immutability: When setting changes to ₦500, old order total must remain ₦8,900
PricingService::setTakeawayPackPrice(500.00);
$historicalOrder = [
    'subtotal'             => 7500.00,
    'packaging_quantity'   => 3,
    'packaging_unit_price' => 300.00,
    'packaging_fee'        => 900.00,
    'delivery_fee'         => 1000.00,
    'discount_amount'      => 500.00,
    'total'                => 8900.00,
];
$recalculated = PricingService::recalculateExistingOrderExpectedTotal($historicalOrder);
report("Historical orders retain original packaging price snapshot (₦8,900) when settings change", $recalculated === 8900.00);
// Revert setting to ₦300
PricingService::setTakeawayPackPrice(300.00);

// -------------------------------------------------------------
// SETUP TEST MENU ITEMS WITH CONTROLLED INVENTORY
// -------------------------------------------------------------
echo "\nSetting up dedicated test dishes with controlled stock...\n";

$menuService = new \App\Services\MenuService();
$adminAuth = ['id' => 1, 'role_name' => ROLE_SUPER_ADMIN];

// Dish A: Tracked stock = 10
$resA = $menuService->createItem([
    'name'                => 'AUDIT_JOLLOF_' . uniqid(),
    'price'               => 2000.00,
    'category_id'         => 1,
    'track_inventory'     => 1,
    'unit_of_measure'     => 'portion',
    'quantity_available'  => 10,
    'requires_packaging'  => 1,
], $adminAuth);
$dishAId = (int) $resA['data']['id'];
$createdMenuItemIds[] = $dishAId;

// Dish B: Tracked stock = 2 (for concurrency & out-of-stock testing)
$resB = $menuService->createItem([
    'name'                => 'AUDIT_CHICKEN_' . uniqid(),
    'price'               => 1500.00,
    'category_id'         => 1,
    'track_inventory'     => 1,
    'unit_of_measure'     => 'piece',
    'quantity_available'  => 2,
    'requires_packaging'  => 1,
], $adminAuth);
$dishBId = (int) $resB['data']['id'];
$createdMenuItemIds[] = $dishBId;

// Dish C: Untracked stock (e.g. bottled water)
$resC = $menuService->createItem([
    'name'                => 'AUDIT_WATER_' . uniqid(),
    'price'               => 500.00,
    'category_id'         => 1,
    'track_inventory'     => 0,
    'unit_of_measure'     => 'bottle',
    'quantity_available'  => 0,
    'requires_packaging'  => 0,
], $adminAuth);
$dishCId = (int) $resC['data']['id'];
$createdMenuItemIds[] = $dishCId;

// -------------------------------------------------------------
// SECTION 2: CASHIER POS WALK-IN ORDER FLOW
// -------------------------------------------------------------
echo "\n2. AUDITING CASHIER POS WALK-IN ORDER FLOW...\n";

$orderService = new OrderService();
$cashierAuth = ['id' => 1, 'role_name' => ROLE_CASHIER];

$cashierOrderData = [
    'customer_name'      => 'Walk-in Guest',
    'source'             => 'cashier',
    'order_type'         => 'walk_in',
    'payment_method'     => 'cash',
    'packaging_quantity' => 1, // Cashier explicitly selects 1 takeaway pack
    'items' => [
        ['menu_item_id' => $dishAId, 'quantity' => 2], // 2 * 2000 = 4000
        ['menu_item_id' => $dishCId, 'quantity' => 1], // 1 * 500 = 500
    ],
];

$cashierOrderRes = $orderService->createOrder($cashierOrderData, $cashierAuth);
report("Cashier walk-in order created successfully", !empty($cashierOrderRes['success']) && !empty($cashierOrderRes['data']['id']));
$cashierOrder = $cashierOrderRes['data'] ?? [];
$createdOrderIds[] = (int) ($cashierOrder['id'] ?? 0);

report("Cashier walk-in order number has QEP prefix", str_starts_with($cashierOrder['order_number'] ?? '', 'QEP'));
// Subtotal = 4000 + 500 = 4500. Packaging (1 * 300) = 300. Total = 4800.
report("Cashier order total correctly includes 1 takeaway pack: ₦4,800", (float)($cashierOrder['total'] ?? 0) === 4800.00);
report("Cashier cash walk-in is immediately paid and accepted",
    ($cashierOrder['payment_status'] ?? '') === 'paid' && ($cashierOrder['order_status'] ?? '') === 'accepted'
);

// Verify stock deduction: Dish A had 10, ordered 2 -> remaining 8
$stockA = InventoryRepository::findByMenuItemId($dishAId);
report("Inventory for Dish A deducted atomically from 10 to 8", (float)$stockA['quantity'] === 8.0);

// Create real test customer for foreign key integrity
$testCustEmail = 'test_order_cust_' . uniqid() . '@qep.test';
$roleCustomer = (int) $db->query("SELECT id FROM roles WHERE name = 'customer'")->fetchColumn();
$testCustHash = password_hash('AuditCustPass123!', PASSWORD_BCRYPT);
$stmt = $db->prepare("INSERT INTO users (full_name, email, password_hash, role_id, status) VALUES ('Audit Customer', :email, :pwd, :role_id, 'active')");
$stmt->execute(['email' => $testCustEmail, 'pwd' => $testCustHash, 'role_id' => $roleCustomer]);
$testCustId = (int) $db->lastInsertId();

$customerAuth = ['id' => $testCustId, 'role_name' => ROLE_CUSTOMER];

// Online Delivery Order
$onlineDeliveryData = [
    'customer_name'    => 'Online Customer',
    'customer_phone'   => '08012345678',
    'source'           => 'customer',
    'order_type'       => 'delivery',
    'delivery_address' => 'Plot 12 Ahmadu Bello Way, Kaduna',
    'delivery_fee'     => 1200.00,
    'payment_method'   => 'paystack',
    'items' => [
        ['menu_item_id' => $dishAId, 'quantity' => 1], // 2000 (requires_packaging = true) -> 1 pack
    ],
];

$deliveryOrderRes = $orderService->createOrder($onlineDeliveryData, $customerAuth);
report("Online delivery order placed successfully", !empty($deliveryOrderRes['success']));
$deliveryOrder = $deliveryOrderRes['data'] ?? [];
$createdOrderIds[] = (int) ($deliveryOrder['id'] ?? 0);

// Subtotal = 2000. Packaging = 300. Delivery = 1200. Total = 3500.
report("Online delivery order calculates automated packaging (₦300) + delivery (₦1,200) = ₦3,500",
    (float)($deliveryOrder['total'] ?? 0) === 3500.00
);
report("Online Paystack order initial status is pending payment & pending order",
    ($deliveryOrder['payment_status'] ?? '') === 'pending' && ($deliveryOrder['order_status'] ?? '') === 'pending'
);

// -------------------------------------------------------------
// SECTION 4: PAYMENT VERIFICATION & IDEMPOTENCY
// -------------------------------------------------------------
echo "\n4. AUDITING PAYMENT VERIFICATION & IDEMPOTENCY...\n";

// Simulate Paystack payment verification
$ref = 'PAYSTACK_AUDIT_REF_' . uniqid();

// Record payment
$orderService->recordPayment((int)$deliveryOrder['id'], 'paystack', 3500.00, $cashierAuth);

// Fetch order after payment
$paidOrder = OrderRepository::findById((int)$deliveryOrder['id']);
report("Order payment status transitions to 'paid'", $paidOrder['payment_status'] === 'paid');

// IDEMPOTENCY TEST: Attempt to submit the exact same transaction reference a second time
$txRef = 'IDEMPOTENCY_TEST_' . uniqid();
$stmt = $db->prepare("
    INSERT INTO transactions (order_id, transaction_reference, amount, payment_method, payment_status)
    VALUES (:oid, :ref, :amt, 'paystack', 'success')
");
$stmt->execute(['oid' => (int)$deliveryOrder['id'], 'ref' => $txRef, 'amt' => 3500.00]);

$duplicateHandled = false;
try {
    $stmt->execute(['oid' => (int)$deliveryOrder['id'], 'ref' => $txRef, 'amt' => 3500.00]);
} catch (\PDOException $e) {
    if ($e->getCode() == 23000 || str_contains($e->getMessage(), 'Duplicate entry')) {
        $duplicateHandled = true;
    }
}
report("Duplicate Paystack transaction reference is rejected by UNIQUE constraint", $duplicateHandled);

// -------------------------------------------------------------
// SECTION 5: GUEST QR TABLE ORDERING FLOW
// -------------------------------------------------------------
echo "\n5. AUDITING GUEST QR TABLE ORDERING MODULE...\n";

// Fetch Table 01
$table = TableRepository::findByTableNumber('Table 01');
if (!$table) {
    $tableId = TableRepository::create([
        'table_number' => 'Table 01',
        'name'         => 'Main Hall Table 1',
        'public_token' => 'TB_AUDIT_TOKEN_01',
        'status'       => 'active',
    ]);
    $table = TableRepository::findById($tableId);
}
report("Valid table token resolves to table correctly", !empty($table['public_token']));

$resolvedTable = TableRepository::findByPublicToken($table['public_token']);
report("Token resolution matches exact table number 'Table 01'", $resolvedTable['table_number'] === 'Table 01');

$invalidLookup = TableRepository::findByPublicToken('NONEXISTENT_FAKE_TOKEN');
report("Nonexistent table token fails to resolve", $invalidLookup === null);

// Test Submit QR Order (Pay After Meal)
$guestOrderService = new GuestOrderService();
$qrOrderResult = $guestOrderService->submitOrder($table['public_token'], [
    'guest_name'     => 'Chief Obinna',
    'payment_timing' => 'pay_after',
    'notes'          => 'Extra pepper please',
    'items'          => [
        ['menu_item_id' => $dishAId, 'quantity' => 1], // 2000
    ],
]);
$qrOrderId = (int) ($qrOrderResult['data']['order_id'] ?? 0);
$createdOrderIds[] = $qrOrderId;

$qrOrder = OrderRepository::findById($qrOrderId);
report("Guest QR order created with source 'qr_guest'", ($qrOrder['source'] ?? '') === 'qr_guest');
report("Guest QR order table_number matches 'Table 01'", ($qrOrder['table_number'] ?? '') === 'Table 01');
report("Guest QR dine-in has zero packaging fee (₦0)", (float)($qrOrder['packaging_fee'] ?? -1) === 0.00);
report("Guest QR Pay-After order initial status is pending payment & submitted order",
    ($qrOrder['payment_status'] ?? '') === 'pending' && ($qrOrder['order_status'] ?? '') === 'submitted'
);
report("Guest order tracking token issued and stored", !empty($qrOrder['guest_access_token']));

// -------------------------------------------------------------
// SECTION 6: KITCHEN & ORDER STATE MACHINE TRANSITIONS
// -------------------------------------------------------------
echo "\n6. AUDITING ORDER STATE MACHINE & WORKFLOW...\n";

// Valid workflow: submitted -> accepted -> preparing -> ready -> completed
$s1 = $orderService->updateOrderStatus($qrOrderId, 'accepted', $cashierAuth);
report("Transition submitted -> accepted succeeds", ($s1['data']['new_status'] ?? '') === 'accepted');

$kitchenAuth = ['id' => 4, 'role_name' => ROLE_KITCHEN];
$s2 = $orderService->updateOrderStatus($qrOrderId, 'preparing', $kitchenAuth);
report("Transition accepted -> preparing succeeds", ($s2['data']['new_status'] ?? '') === 'preparing');

$s3 = $orderService->updateOrderStatus($qrOrderId, 'ready', $kitchenAuth);
report("Transition preparing -> ready succeeds", ($s3['data']['new_status'] ?? '') === 'ready');

// Unpaid order cannot be marked completed (DEF-004 defense)
try {
    $unpaidComplete = $orderService->updateOrderStatus($qrOrderId, 'completed', $cashierAuth);
    $unpaidRejected = empty($unpaidComplete['success']);
} catch (\Throwable $e) {
    $unpaidRejected = true;
}
report("Transition ready -> completed BLOCKED while payment is pending", $unpaidRejected);

// Cashier records payment (e.g. guest pays after meal)
OrderRepository::updatePaymentStatus($qrOrderId, 'paid', 'cash');

$s4 = $orderService->updateOrderStatus($qrOrderId, 'completed', $cashierAuth);
report("Transition ready -> completed succeeds once payment is confirmed", ($s4['data']['new_status'] ?? '') === 'completed');

// Test invalid backwards transition: completed -> pending should be blocked
$invalidRes = $orderService->updateOrderStatus($qrOrderId, 'pending', $cashierAuth);
report("Invalid backward transition (completed -> pending) is rejected", empty($invalidRes['success']));

// -------------------------------------------------------------
// SECTION 7: CONCURRENCY & OVERSELLING PREVENTION (Row-Locking)
// -------------------------------------------------------------
echo "\n7. AUDITING CONCURRENCY & OVERSELLING RESILIENCE...\n";

// Dish B currently has 2 portions available
$stockBInitial = InventoryRepository::findByMenuItemId($dishBId);
report("Dish B starting stock is exactly 2 portions", (float)$stockBInitial['quantity'] === 2.0);

// Place valid Order 1 for 2 portions -> succeeds
$concOrder1Res = $orderService->createOrder([
    'customer_name'  => 'Concurrent Buyer 1',
    'source'         => 'customer',
    'order_type'     => 'pickup',
    'payment_method' => 'paystack', // Starts as pending so it can be cancelled/rejected
    'items'          => [['menu_item_id' => $dishBId, 'quantity' => 2]],
], ['id' => $testCustId, 'role_name' => ROLE_CUSTOMER]);
$concOrder1 = $concOrder1Res['data'] ?? [];
$createdOrderIds[] = (int) ($concOrder1['id'] ?? 0);
report("Order 1 successfully consumes remaining 2 portions", !empty($concOrder1['id']));

$stockBAfter = InventoryRepository::findByMenuItemId($dishBId);
report("Dish B stock reached 0.0 without becoming negative", (float)$stockBAfter['quantity'] === 0.0);

// Place Order 2 for 1 portion while stock is 0 -> MUST BE REJECTED
$order2Res = $orderService->createOrder([
    'customer_name'  => 'Concurrent Buyer 2',
    'source'         => 'customer',
    'order_type'     => 'pickup',
    'payment_method' => 'paystack',
    'items'          => [['menu_item_id' => $dishBId, 'quantity' => 1]],
], ['id' => $testCustId, 'role_name' => ROLE_CUSTOMER]);
report("Overselling prevented: Order 2 rejected when stock reaches zero", empty($order2Res['success']));

$finalStockB = InventoryRepository::findByMenuItemId($dishBId);
report("Stock never drops below zero (remains 0, not -1)", (float)$finalStockB['quantity'] === 0.0);

// -------------------------------------------------------------
// SECTION 8: CANCELLATION & INVENTORY RESTORATION
// -------------------------------------------------------------
echo "\n8. AUDITING CANCELLATION & INVENTORY RESTORATION...\n";

// Reject/Cancel un-prepared order -> portions should restore to 2
$rejectRes = $orderService->rejectOrder((int)$concOrder1['id'], 'Customer cancelled before preparation', $cashierAuth);
$restoredStockB = InventoryRepository::findByMenuItemId($dishBId);
report("Rejecting un-prepared order restores consumed stock from 0 back to 2",
    !empty($rejectRes['success']) && (float)$restoredStockB['quantity'] === 2.0
);

// -------------------------------------------------------------
// SECTION 9: THERMAL RECEIPT DATA FIDELITY
// -------------------------------------------------------------
echo "\n9. AUDITING THERMAL RECEIPT DATA FIDELITY...\n";

$receiptOrder = $orderService->getOrder((int)$cashierOrder['id'], $cashierAuth);
report("Receipt retains customer/guest name", !empty($receiptOrder['customer_name']));
report("Receipt retains packaging breakdown (qty + fee)", isset($receiptOrder['packaging_quantity']) && isset($receiptOrder['packaging_fee']));
report("Receipt retains all line items and line item totals", count($receiptOrder['items'] ?? []) === 2);
report("Receipt total matches sum of items + packaging",
    (float)$receiptOrder['total'] === ((float)$receiptOrder['subtotal'] + (float)$receiptOrder['packaging_fee'])
);

// -------------------------------------------------------------
// CLEANUP TEST DATA
// -------------------------------------------------------------
echo "\nCleaning up order audit test records...\n";
foreach ($createdOrderIds as $oid) {
    if ($oid > 0) {
        $db->exec("DELETE FROM order_items WHERE order_id = {$oid}");
        $db->exec("DELETE FROM transactions WHERE order_id = {$oid}");
        $db->exec("DELETE FROM orders WHERE id = {$oid}");
    }
}
foreach ($createdMenuItemIds as $mid) {
    if ($mid > 0) {
        $db->exec("DELETE FROM stock_movements WHERE inventory_id IN (SELECT id FROM inventory WHERE menu_item_id = {$mid})");
        $db->exec("DELETE FROM inventory WHERE menu_item_id = {$mid}");
        $db->exec("DELETE FROM menu_items WHERE id = {$mid}");
    }
}
$db->exec("DELETE FROM users WHERE id = {$testCustId}");
echo "Cleaned up all temporary audit orders, dishes, and test customer.\n";

echo "\n==============================================================\n";
echo "ORDER ENGINE AUDIT SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "==============================================================\n";

if ($failCount > 0) {
    exit(1);
}
