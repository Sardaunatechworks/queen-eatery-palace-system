<?php
/**
 * Test Suite: Takeaway Packaging Charges & Authoritative Pricing
 */

declare(strict_types=1);

define('QEP_APP', true);
require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/repositories/SettingRepository.php';
require_once __DIR__ . '/repositories/MenuRepository.php';
require_once __DIR__ . '/repositories/OrderRepository.php';
require_once __DIR__ . '/services/PricingService.php';

use App\Services\PricingService;
use App\Repositories\SettingRepository;

echo "======================================================\n";
echo "TEST SUITE: TAKEAWAY PACKAGING CHARGES & PRICING RULES\n";
echo "======================================================\n";

$allPassed = true;

function assertEqual($expected, $actual, string $testName): void {
    global $allPassed;
    if ($expected === $actual) {
        echo " [PASS] {$testName} (Expected: {$expected}, Got: {$actual})\n";
    } else {
        echo " [FAIL] {$testName} (Expected: " . var_export($expected, true) . ", Got: " . var_export($actual, true) . ")\n";
        $allPassed = false;
    }
}

// 1. Check unit price configuration
$unitPrice = PricingService::getTakeawayPackPrice();
assertEqual(300.00, $unitPrice, "Default Takeaway Pack Price is 300.00");

// 2. Test Minimum Business Rule Calculations
// 0 packs × ₦300 = ₦0
$res0 = PricingService::calculateOrderTotals([], 'cashier', 0);
assertEqual(0, $res0['packaging_quantity'], "0 packs count");
assertEqual(0.00, $res0['packaging_fee'], "0 packs × ₦300 = ₦0");

// 1 pack × ₦300 = ₦300
$res1 = PricingService::calculateOrderTotals([], 'cashier', 1);
assertEqual(1, $res1['packaging_quantity'], "1 pack count");
assertEqual(300.00, $res1['packaging_fee'], "1 pack × ₦300 = ₦300");

// 2 packs × ₦300 = ₦600
$res2 = PricingService::calculateOrderTotals([], 'cashier', 2);
assertEqual(2, $res2['packaging_quantity'], "2 packs count");
assertEqual(600.00, $res2['packaging_fee'], "2 packs × ₦300 = ₦600");

// 5 packs × ₦300 = ₦1,500
$res5 = PricingService::calculateOrderTotals([], 'cashier', 5);
assertEqual(5, $res5['packaging_quantity'], "5 packs count");
assertEqual(1500.00, $res5['packaging_fee'], "5 packs × ₦300 = ₦1,500");

// 3. Test Mixed Online Order (Customer)
// 2 × Jollof Rice (₦2,500 each, requires_packaging = true)
// 1 × Chicken Plate (₦2,000 each, requires_packaging = true)
// 2 × Bottled Water (₦500 each, requires_packaging = false)
$mixedCart = [
    [
        'item_name'          => 'Jollof Rice',
        'price'              => 2500.00,
        'quantity'           => 2,
        'requires_packaging' => true,
    ],
    [
        'item_name'          => 'Chicken Plate',
        'price'              => 2000.00,
        'quantity'           => 1,
        'requires_packaging' => true,
    ],
    [
        'item_name'          => 'Bottled Water',
        'price'              => 500.00,
        'quantity'           => 2,
        'requires_packaging' => false,
    ],
];

$onlinePricing = PricingService::calculateOrderTotals($mixedCart, 'customer');

// Subtotal: (2 * 2500) + (1 * 2000) + (2 * 500) = 5000 + 2000 + 1000 = 8000.00
assertEqual(8000.00, $onlinePricing['subtotal'], "Food Subtotal = ₦8,000");

// Packaging quantity should only count Jollof (2) + Chicken (1) = 3 packs
assertEqual(3, $onlinePricing['packaging_quantity'], "Packaging quantity = 3 (excluding bottled water)");

// Packaging Fee: 3 × ₦300 = ₦900
assertEqual(900.00, $onlinePricing['packaging_fee'], "Packaging Fee = ₦900");

// Grand total: 8000 + 900 = 8900
assertEqual(8900.00, $onlinePricing['grand_total'], "Grand Total = ₦8,900");

// 4. Test Cashier Dine-In / Manual Override (0 packs)
$cashierDineIn = PricingService::calculateOrderTotals($mixedCart, 'cashier', 0);
assertEqual(0, $cashierDineIn['packaging_quantity'], "Cashier override: 0 packs");
assertEqual(0.00, $cashierDineIn['packaging_fee'], "Cashier override packaging fee = ₦0");
assertEqual(8000.00, $cashierDineIn['grand_total'], "Cashier dine-in grand total = ₦8,000");

// 5. Test Changing Setting Does NOT Alter Historical Snapshot
$mockHistoricalOrder = [
    'subtotal'               => 7500.00,
    'packaging_quantity'     => 3,
    'packaging_unit_price'   => 300.00,
    'packaging_fee'          => 900.00,
    'delivery_fee'           => 0.00,
    'discount_amount'        => 0.00,
    'total'                  => 8400.00,
];

// Temporarily change price setting
PricingService::setTakeawayPackPrice(500.00);
assertEqual(500.00, PricingService::getTakeawayPackPrice(), "Setting updated to ₦500");

// Recalculating historical order MUST still yield ₦8,400 based on snapshot
$recalculated = PricingService::recalculateExistingOrderExpectedTotal($mockHistoricalOrder);
assertEqual(8400.00, $recalculated, "Historical order retains snapshot pricing of ₦8,400 even after setting changes to ₦500");

// Revert setting back to ₦300
PricingService::setTakeawayPackPrice(300.00);
assertEqual(300.00, PricingService::getTakeawayPackPrice(), "Reverted setting back to ₦300");

echo "======================================================\n";
if ($allPassed) {
    echo "ALL TESTS PASSED SUCCESSFULLY! (14/14)\n";
} else {
    echo "SOME TESTS FAILED!\n";
    exit(1);
}
