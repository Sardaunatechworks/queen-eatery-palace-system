<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Pricing Service
 *
 * Central authoritative pricing engine for takeaway packaging charges,
 * menu item packaging requirements, and order total calculations.
 * Reusable across Cashier POS, Customer Online Orders, Paystack Verification, and Receipts.
 */

declare(strict_types=1);

namespace App\Services;

use App\Repositories\SettingRepository;
use App\Repositories\MenuRepository;
use App\Repositories\OrderRepository;

class PricingService
{
    public const DEFAULT_PACK_PRICE = 300.00;
    public const SETTING_KEY_PACK_PRICE = 'takeaway_pack_price';

    /**
     * Retrieve the current takeaway packaging unit price from settings.
     * Default to ₦300.00 if setting not configured.
     */
    public static function getTakeawayPackPrice(): float
    {
        $val = SettingRepository::get(self::SETTING_KEY_PACK_PRICE, (string) self::DEFAULT_PACK_PRICE);
        $price = (float) $val;
        return $price >= 0 ? $price : self::DEFAULT_PACK_PRICE;
    }

    /**
     * Update the takeaway packaging unit price (Admin only).
     * Affects NEW orders only; historical orders remain immutable.
     */
    public static function setTakeawayPackPrice(float $newPrice, ?int $userId = null): void
    {
        if ($newPrice < 0) {
            throw new \InvalidArgumentException('Packaging price cannot be negative');
        }

        SettingRepository::set(
            self::SETTING_KEY_PACK_PRICE,
            number_format($newPrice, 2, '.', ''),
            'Takeaway Pack Price',
            'Cost per takeaway pack container in NGN',
            $userId
        );
    }

    /**
     * Calculate packaging quantity based on items requiring packaging.
     *
     * @param array $items Array of items, each having 'requires_packaging' (bool/int) and 'quantity' (int).
     * @return int
     */
    public static function calculateRequiredPacks(array $items): int
    {
        $packCount = 0;
        foreach ($items as $item) {
            $req = $item['requires_packaging'] ?? true;
            // Treat boolean true, int 1, or string "1" as requiring packaging
            if ($req === true || $req === 1 || $req === '1') {
                $qty = (int) ($item['quantity'] ?? 0);
                $packCount += max(0, $qty);
            }
        }
        return $packCount;
    }

    /**
     * Authoritative pricing calculation for an order.
     *
     * @param array $processedItems Items with price, quantity, and requires_packaging.
     * @param string $source 'cashier' or 'customer'.
     * @param int|null $explicitPackagingQty Optional manual packaging quantity (used by cashier).
     * @param float $deliveryFee Delivery fee if applicable.
     * @param float $discountAmount Discount amount if applicable.
     * @return array
     */
    public static function calculateOrderTotals(
        array $processedItems,
        string $source = 'customer',
        ?int $explicitPackagingQty = null,
        float $deliveryFee = 0.00,
        float $discountAmount = 0.00
    ): array {
        // 1. Food subtotal
        $subtotal = 0.00;
        foreach ($processedItems as $item) {
            $unitPrice = (float) ($item['unit_price'] ?? $item['price'] ?? 0);
            $qty = (int) ($item['quantity'] ?? 0);
            $subtotal += round($unitPrice * $qty, 2);
        }
        $subtotal = round($subtotal, 2);

        // 2. Packaging unit price snapshot from system settings
        $unitPrice = self::getTakeawayPackPrice();

        // 3. Packaging quantity determination
        // QR guest dine-in orders have zero packaging fee.
        // Cashier determines actual required packs; customer online order is automated based on items requiring packaging.
        if ($source === 'qr_guest') {
            $packagingQuantity = 0;
        } elseif ($source === 'cashier' && $explicitPackagingQty !== null) {
            $packagingQuantity = max(0, $explicitPackagingQty);
        } else {
            $packagingQuantity = self::calculateRequiredPacks($processedItems);
        }

        // 4. Packaging Fee = Quantity * Unit Price
        $packagingFee = round($packagingQuantity * $unitPrice, 2);

        // 5. Grand Total = subtotal + packaging_fee + delivery_fee - discount_amount
        $deliveryFee = max(0.00, round($deliveryFee, 2));
        $discountAmount = max(0.00, round($discountAmount, 2));
        $grandTotal = round($subtotal + $packagingFee + $deliveryFee - $discountAmount, 2);

        return [
            'subtotal'               => $subtotal,
            'packaging_quantity'     => $packagingQuantity,
            'packaging_unit_price'   => $unitPrice,
            'packaging_fee'          => $packagingFee,
            'delivery_fee'           => $deliveryFee,
            'discount_amount'        => $discountAmount,
            'grand_total'            => $grandTotal,
        ];
    }

    /**
     * Independently recalculate an existing order's expected total.
     * Uses the immutable snapshot values saved in the order header!
     */
    public static function recalculateExistingOrderExpectedTotal(array $order): float
    {
        $subtotal = (float) ($order['subtotal'] ?? 0.00);
        $packagingFee = (float) ($order['packaging_fee'] ?? 0.00);
        $deliveryFee = (float) ($order['delivery_fee'] ?? 0.00);
        $discountAmount = (float) ($order['discount_amount'] ?? 0.00);

        // If packaging fee was not pre-calculated in older legacy orders, check packaging_quantity * unit_price
        if ($packagingFee <= 0 && !empty($order['packaging_quantity']) && !empty($order['packaging_unit_price'])) {
            $packagingFee = round(((int) $order['packaging_quantity']) * ((float) $order['packaging_unit_price']), 2);
        }

        return round($subtotal + $packagingFee + $deliveryFee - $discountAmount, 2);
    }
}
