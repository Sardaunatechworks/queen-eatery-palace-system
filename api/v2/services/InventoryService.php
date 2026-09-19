<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Inventory Service
 *
 * SINGLE SOURCE OF TRUTH for all stock operations.
 * No other code should directly modify inventory or stock_movements tables.
 *
 * All mutating methods assume they are called within an active PDO transaction.
 * They use SELECT ... FOR UPDATE row-locking to prevent race conditions.
 *
 * Movement Types:
 *   stock_in       — purchase / restock
 *   order_deduct   — deducted when order is confirmed
 *   order_restore  — restored when order is cancelled / rejected
 *   wastage        — food waste, expired, spoilt
 *   damaged        — physically damaged stock
 *   manual_adjust  — admin manual correction
 *   initial        — initial stock when menu item is created
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Repositories\InventoryRepository;
use App\Repositories\MenuRepository;

class InventoryService
{
    // ============================================
    // Availability Checks (read-only, no lock)
    // ============================================

    /**
     * Check stock availability for a list of order items.
     * Respects the track_inventory flag on each menu item.
     *
     * @param array $items Array of ['menu_item_id' => int, 'quantity' => int/float, ...]
     * @return array ['available' => bool, 'errors' => [...]]
     */
    public static function checkAvailability(array $items): array
    {
        $errors = [];
        $db = Database::getConnection();

        foreach ($items as $item) {
            $menuItemId = (int) ($item['menu_item_id'] ?? $item['id'] ?? 0);
            $qtyRequested = (float) ($item['quantity'] ?? 0);

            if ($menuItemId <= 0 || $qtyRequested <= 0) {
                $errors[] = ['menu_item_id' => $menuItemId, 'message' => 'Invalid item or quantity'];
                continue;
            }

            $stmt = $db->prepare('
                SELECT id, name, status, approval_status, track_inventory, quantity_available
                FROM menu_items
                WHERE id = :id
            ');
            $stmt->execute(['id' => $menuItemId]);
            $menuItem = $stmt->fetch();

            if (!$menuItem) {
                $errors[] = ['menu_item_id' => $menuItemId, 'message' => "Menu item not found (ID: {$menuItemId})"];
                continue;
            }

            if ($menuItem['status'] === 'disabled') {
                $errors[] = [
                    'menu_item_id' => $menuItemId,
                    'message'      => "'{$menuItem['name']}' is currently unavailable",
                ];
                continue;
            }

            if ($menuItem['approval_status'] !== 'approved') {
                $errors[] = [
                    'menu_item_id' => $menuItemId,
                    'message'      => "'{$menuItem['name']}' has not been approved",
                ];
                continue;
            }

            // If track_inventory is disabled, item is always available (unlimited)
            if (!(bool) $menuItem['track_inventory']) {
                continue;
            }

            $available = (float) $menuItem['quantity_available'];
            if ($available < $qtyRequested) {
                if ($available <= 0) {
                    $errors[] = [
                        'menu_item_id' => $menuItemId,
                        'message'      => "'{$menuItem['name']}' is out of stock",
                    ];
                } else {
                    $errors[] = [
                        'menu_item_id' => $menuItemId,
                        'message'      => "Only " . self::formatQty($available) . " portions of '{$menuItem['name']}' currently available. Requested: " . self::formatQty($qtyRequested),
                    ];
                }
            }
        }

        return [
            'available' => empty($errors),
            'errors'    => $errors,
        ];
    }

    /**
     * Final sellability check for a single menu item.
     * Rule: approved AND NOT disabled AND (track_inventory = false OR quantity > 0)
     */
    public static function isItemSellable(array $menuItem): bool
    {
        if (($menuItem['approval_status'] ?? '') !== 'approved') {
            return false;
        }
        if (($menuItem['status'] ?? '') === 'disabled') {
            return false;
        }
        if (!(bool) ($menuItem['track_inventory'] ?? true)) {
            return true; // Unlimited stock
        }
        return (float) ($menuItem['quantity_available'] ?? 0) > 0;
    }

    // ============================================
    // Stock Mutations (require active transaction)
    // ============================================

    /**
     * Deduct stock atomically for an order.
     * MUST be called within an active PDO transaction.
     *
     * @param array  $items     Array of ['menu_item_id' => int, 'quantity' => int/float, 'item_name' => string]
     * @param string $reference Order reference (e.g., "ORDER_QEP00123")
     * @param int    $userId    User performing the action
     * @return array ['low_stock_triggered' => [...]]
     */
    public static function deductStock(array $items, string $reference, int $userId): array
    {
        $db = Database::getConnection();
        $lowStockTriggered = [];

        foreach ($items as $item) {
            $menuItemId = (int) ($item['menu_item_id'] ?? 0);
            $qtyToDeduct = (float) ($item['quantity'] ?? 0);
            $itemName = $item['item_name'] ?? $item['name'] ?? 'Unknown';

            if ($menuItemId <= 0 || $qtyToDeduct <= 0) {
                continue;
            }

            // Check if this item tracks inventory
            $miStmt = $db->prepare('SELECT track_inventory FROM menu_items WHERE id = :id');
            $miStmt->execute(['id' => $menuItemId]);
            $mi = $miStmt->fetch();
            if ($mi && !(bool) $mi['track_inventory']) {
                continue; // No inventory tracking — skip deduction
            }

            // Lock and deduct menu_items.quantity_available
            $db->prepare('
                UPDATE menu_items
                SET quantity_available = GREATEST(0, quantity_available - :qty),
                    status = IF(quantity_available - :qty2 <= 0, "out_of_stock", status)
                WHERE id = :id AND status != "disabled"
            ')->execute([
                'qty'  => $qtyToDeduct,
                'qty2' => $qtyToDeduct,
                'id'   => $menuItemId,
            ]);

            // Lock and deduct inventory table
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if ($inv) {
                $currentQty = (float) $inv['quantity'];
                $newQty = max(0, $currentQty - $qtyToDeduct);

                InventoryRepository::updateQuantity($inv['id'], $newQty, $userId);

                InventoryRepository::createStockMovement(
                    $inv['id'],
                    'order_deduct',
                    $qtyToDeduct,
                    $reference,
                    $userId,
                    null,
                    $currentQty,
                    $newQty
                );

                // Check low stock
                $threshold = (float) $inv['low_stock_threshold'];
                if ($newQty <= $threshold) {
                    $lowStockTriggered[] = [
                        'name'      => $itemName,
                        'qty'       => $newQty,
                        'threshold' => $threshold,
                    ];
                }
            }
        }

        return ['low_stock_triggered' => $lowStockTriggered];
    }

    /**
     * Restore stock atomically for a cancelled/rejected order.
     * MUST be called within an active PDO transaction.
     *
     * @param array  $items     Array of ['menu_item_id' => int, 'quantity' => int/float]
     * @param string $reference Restore reference (e.g., "RESTORE_QEP00123")
     * @param int    $userId    User performing the action
     */
    public static function restoreStock(array $items, string $reference, int $userId): void
    {
        $db = Database::getConnection();

        foreach ($items as $item) {
            $menuItemId = (int) ($item['menu_item_id'] ?? 0);
            $qtyToRestore = (float) ($item['quantity'] ?? 0);

            if ($menuItemId <= 0 || $qtyToRestore <= 0) {
                continue;
            }

            // Check if this item tracks inventory
            $miStmt = $db->prepare('SELECT track_inventory FROM menu_items WHERE id = :id');
            $miStmt->execute(['id' => $menuItemId]);
            $mi = $miStmt->fetch();
            if ($mi && !(bool) $mi['track_inventory']) {
                continue; // No inventory tracking — skip restoration
            }

            // Restore menu_items
            $db->prepare('
                UPDATE menu_items
                SET quantity_available = quantity_available + :qty,
                    status = "available"
                WHERE id = :id AND status != "disabled"
            ')->execute(['qty' => $qtyToRestore, 'id' => $menuItemId]);

            // Restore inventory table
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if ($inv) {
                $currentQty = (float) $inv['quantity'];
                $newQty = $currentQty + $qtyToRestore;

                InventoryRepository::updateQuantity($inv['id'], $newQty, $userId);

                InventoryRepository::createStockMovement(
                    $inv['id'],
                    'order_restore',
                    $qtyToRestore,
                    $reference,
                    $userId,
                    null,
                    $currentQty,
                    $newQty
                );
            }
        }
    }

    /**
     * Stock-in: add stock (purchase/restock).
     * Starts its own transaction.
     *
     * @return array ['success' => bool, 'data' => [...]]
     */
    public static function stockIn(int $menuItemId, float $quantity, string $notes, int $userId): array
    {
        if ($quantity <= 0) {
            return ['success' => false, 'message' => 'Stock-in quantity must be greater than zero'];
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if (!$inv) {
                $menuItem = MenuRepository::findById($menuItemId);
                if (!$menuItem) {
                    $db->rollBack();
                    return ['success' => false, 'message' => 'Menu item not found'];
                }
                $baseQty = (float)($menuItem['quantity_available'] ?? 0);
                $newInvId = InventoryRepository::createForMenuItem($menuItemId, $baseQty, 5.0, $userId);
                $inv = [
                    'id' => $newInvId,
                    'menu_item_id' => $menuItemId,
                    'quantity' => $baseQty,
                    'low_stock_threshold' => 5.0,
                    'last_updated_by' => $userId,
                ];
            }

            $currentQty = (float) $inv['quantity'];
            $newQty = $currentQty + $quantity;

            InventoryRepository::updateQuantity($inv['id'], $newQty, $userId);

            InventoryRepository::createStockMovement(
                $inv['id'],
                'stock_in',
                $quantity,
                'STOCK_IN',
                $userId,
                $notes,
                $currentQty,
                $newQty
            );

            // Sync menu item availability
            self::syncMenuItemAvailability($menuItemId, $newQty);

            $db->commit();

            // Audit
            $item = MenuRepository::findById($menuItemId);
            AuditService::stockAdjusted($menuItemId, $item['name'] ?? 'Item', 'stock_in', (int) $quantity);

            return [
                'success' => true,
                'message' => 'Stock added successfully',
                'data'    => [
                    'menu_item_id'    => $menuItemId,
                    'quantity_before' => $currentQty,
                    'quantity_added'  => $quantity,
                    'quantity_after'  => $newQty,
                ],
            ];
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Record wastage / damaged stock.
     * Starts its own transaction.
     *
     * @param string $type 'wastage' or 'damaged'
     * @return array ['success' => bool, 'data' => [...]]
     */
    public static function recordWastage(int $menuItemId, float $quantity, string $notes, int $userId, string $type = 'wastage'): array
    {
        if ($quantity <= 0) {
            return ['success' => false, 'message' => 'Wastage quantity must be greater than zero'];
        }

        $validTypes = ['wastage', 'damaged'];
        if (!in_array($type, $validTypes, true)) {
            $type = 'wastage';
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if (!$inv) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Inventory record not found for this menu item'];
            }

            $currentQty = (float) $inv['quantity'];
            if ($quantity > $currentQty) {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => "Cannot record wastage of " . self::formatQty($quantity) . ". Current stock is only " . self::formatQty($currentQty),
                ];
            }

            $newQty = max(0, $currentQty - $quantity);

            InventoryRepository::updateQuantity($inv['id'], $newQty, $userId);

            InventoryRepository::createStockMovement(
                $inv['id'],
                $type,
                $quantity,
                strtoupper($type) . '_RECORD',
                $userId,
                $notes,
                $currentQty,
                $newQty
            );

            // Sync menu item availability
            self::syncMenuItemAvailability($menuItemId, $newQty);

            // Check low stock
            self::checkAndNotifyLowStock($inv, $newQty);

            $db->commit();

            // Audit
            $item = MenuRepository::findById($menuItemId);
            AuditService::stockAdjusted($menuItemId, $item['name'] ?? 'Item', $type, (int) $quantity);

            return [
                'success' => true,
                'message' => ucfirst($type) . ' recorded successfully',
                'data'    => [
                    'menu_item_id'      => $menuItemId,
                    'quantity_before'   => $currentQty,
                    'quantity_recorded' => $quantity,
                    'quantity_after'    => $newQty,
                ],
            ];
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Manual adjustment: set absolute quantity.
     * Starts its own transaction.
     *
     * @return array ['success' => bool, 'data' => [...]]
     */
    public static function manualAdjust(int $menuItemId, float $newQuantity, string $notes, int $userId): array
    {
        if ($newQuantity < 0) {
            return ['success' => false, 'message' => 'Quantity cannot be negative'];
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if (!$inv) {
                $menuItem = MenuRepository::findById($menuItemId);
                if (!$menuItem) {
                    $db->rollBack();
                    return ['success' => false, 'message' => 'Menu item not found'];
                }
                $baseQty = (float)($menuItem['quantity_available'] ?? 0);
                $newInvId = InventoryRepository::createForMenuItem($menuItemId, $baseQty, 5.0, $userId);
                $inv = [
                    'id' => $newInvId,
                    'menu_item_id' => $menuItemId,
                    'quantity' => $baseQty,
                    'low_stock_threshold' => 5.0,
                    'last_updated_by' => $userId,
                ];
            }

            $currentQty = (float) $inv['quantity'];
            $diff = $newQuantity - $currentQty;

            if ($diff == 0) {
                $db->rollBack();
                return ['success' => true, 'message' => 'No change in quantity', 'data' => []];
            }

            InventoryRepository::updateQuantity($inv['id'], $newQuantity, $userId);

            InventoryRepository::createStockMovement(
                $inv['id'],
                'manual_adjust',
                abs($diff),
                'MANUAL_ADJUST',
                $userId,
                $notes,
                $currentQty,
                $newQuantity
            );

            // Sync menu item availability
            self::syncMenuItemAvailability($menuItemId, $newQuantity);

            // Check low stock
            if ($newQuantity < $currentQty) {
                self::checkAndNotifyLowStock($inv, $newQuantity);
            }

            $db->commit();

            // Audit
            $item = MenuRepository::findById($menuItemId);
            AuditService::stockAdjusted($menuItemId, $item['name'] ?? 'Item', 'manual_adjust', (int) abs($diff));

            return [
                'success' => true,
                'message' => 'Stock adjusted successfully',
                'data'    => [
                    'menu_item_id'    => $menuItemId,
                    'quantity_before' => $currentQty,
                    'quantity_after'  => $newQuantity,
                    'difference'      => $diff,
                ],
            ];
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Record initial stock when a menu item is first created.
     * MUST be called within an active PDO transaction (from MenuService).
     */
    public static function recordInitialStock(int $inventoryId, float $quantity, int $userId): void
    {
        if ($quantity <= 0) {
            return;
        }

        InventoryRepository::createStockMovement(
            $inventoryId,
            'initial',
            $quantity,
            'INITIAL_STOCK',
            $userId,
            'Initial stock when menu item was created',
            0.0,
            $quantity
        );
    }

    // ============================================
    // Sync & Notification Helpers
    // ============================================

    /**
     * Sync menu_items.quantity_available and status from inventory.
     */
    public static function syncMenuItemAvailability(int $menuItemId, ?float $inventoryQty = null): void
    {
        $db = Database::getConnection();

        if ($inventoryQty === null) {
            $inv = InventoryRepository::findByMenuItemId($menuItemId);
            $inventoryQty = $inv ? (float) $inv['quantity'] : 0.0;
        }

        $status = $inventoryQty > 0 ? 'available' : 'out_of_stock';

        $db->prepare('
            UPDATE menu_items
            SET quantity_available = :qty, status = :status
            WHERE id = :mid AND status != :disabled
        ')->execute([
            'qty'      => $inventoryQty,
            'status'   => $status,
            'mid'      => $menuItemId,
            'disabled' => 'disabled',
        ]);
    }

    /**
     * Fire low-stock notification if quantity is at or below threshold.
     *
     * @param array $inv Inventory record
     * @param float $currentQty Current quantity after change
     */
    public static function checkAndNotifyLowStock(array $inv, float $currentQty): void
    {
        $threshold = (float) ($inv['low_stock_threshold'] ?? 5);

        if ($currentQty <= $threshold) {
            $menuItemId = (int) $inv['menu_item_id'];
            $item = MenuRepository::findById($menuItemId);
            $itemName = $item['name'] ?? 'Item';

            try {
                NotificationService::lowStockAlert($itemName, (int) $currentQty, (int) $threshold);
            } catch (\Throwable $e) {
                error_log("InventoryService::checkAndNotifyLowStock failed: " . $e->getMessage());
            }
        }
    }

    // ============================================
    // Threshold Update
    // ============================================

    /**
     * Update low stock threshold only.
     * Starts its own transaction.
     */
    public static function updateThreshold(int $menuItemId, float $threshold, int $userId): array
    {
        if ($threshold < 0) {
            return ['success' => false, 'message' => 'Threshold cannot be negative'];
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $inv = InventoryRepository::findByMenuItemIdForUpdate($menuItemId);
            if (!$inv) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Inventory record not found'];
            }

            InventoryRepository::update($inv['id'], (float) $inv['quantity'], $threshold, $userId);

            $db->commit();

            return ['success' => true, 'message' => 'Threshold updated successfully'];
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    // ============================================
    // Helpers
    // ============================================

    /**
     * Format a quantity for display — whole numbers show without decimals.
     */
    private static function formatQty(float $qty): string
    {
        return $qty == (int) $qty ? (string) (int) $qty : number_format($qty, 2);
    }
}
