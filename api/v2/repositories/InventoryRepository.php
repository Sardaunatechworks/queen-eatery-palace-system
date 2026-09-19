<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Inventory Repository
 *
 * All inventory-related SQL queries live here.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class InventoryRepository
{
    /**
     * List all inventory records with menu item details.
     */
    public static function listAll(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT i.id, i.menu_item_id, i.quantity, i.low_stock_threshold,
                   i.last_updated_by, i.updated_at,
                   m.name AS item_name, m.image_path AS item_image,
                   m.price AS item_price, m.status AS item_status,
                   m.track_inventory, m.unit_of_measure,
                   c.name AS category_name
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            ORDER BY m.name ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Find an inventory record by its menu item ID.
     */
    public static function findByMenuItemId(int $menuItemId): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT i.*, m.name AS item_name
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE i.menu_item_id = :mid
            LIMIT 1
        ');
        $stmt->execute(['mid' => $menuItemId]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find an inventory record by ID with row lock (FOR UPDATE).
     */
    public static function findByIdForUpdate(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT id, menu_item_id, quantity, low_stock_threshold, last_updated_by
            FROM inventory
            WHERE id = :id
            FOR UPDATE
        ');
        $stmt->execute(['id' => $id]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find an inventory record by menu item ID with row lock (FOR UPDATE).
     */
    public static function findByMenuItemIdForUpdate(int $menuItemId): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT id, menu_item_id, quantity, low_stock_threshold, last_updated_by
            FROM inventory
            WHERE menu_item_id = :mid
            FOR UPDATE
        ');
        $stmt->execute(['mid' => $menuItemId]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Create a new inventory record for a menu item. Returns the new ID.
     */
    public static function createForMenuItem(int $menuItemId, float $qty, float $threshold, int $updatedBy): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO inventory (menu_item_id, quantity, low_stock_threshold, last_updated_by)
            VALUES (:mid, :qty, :threshold, :updater)
        ');
        $stmt->execute([
            'mid'       => $menuItemId,
            'qty'       => $qty,
            'threshold' => $threshold,
            'updater'   => $updatedBy,
        ]);
        return (int) $db->lastInsertId();
    }

    /**
     * Update an inventory record's quantity and threshold.
     */
    public static function update(int $id, float $qty, float $threshold, int $updatedBy): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE inventory
            SET quantity = :qty, low_stock_threshold = :threshold, last_updated_by = :updater
            WHERE id = :id
        ');
        $stmt->execute([
            'qty'       => $qty,
            'threshold' => $threshold,
            'updater'   => $updatedBy,
            'id'        => $id,
        ]);
    }

    /**
     * Update quantity only.
     */
    public static function updateQuantity(int $id, float $qty, int $updatedBy): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE inventory
            SET quantity = :qty, last_updated_by = :updater
            WHERE id = :id
        ');
        $stmt->execute([
            'qty'     => $qty,
            'updater' => $updatedBy,
            'id'      => $id,
        ]);
    }

    /**
     * Sync menu_items table status based on inventory quantity.
     */
    public static function syncMenuItemStatus(int $menuItemId, float $qty): void
    {
        $db = Database::getConnection();
        $status = $qty > 0 ? 'available' : 'out_of_stock';
        $stmt = $db->prepare('
            UPDATE menu_items
            SET quantity_available = :qty, status = :status
            WHERE id = :mid AND status != :disabled
        ');
        $stmt->execute([
            'qty'      => $qty,
            'status'   => $status,
            'mid'      => $menuItemId,
            'disabled' => 'disabled',
        ]);
    }

    /**
     * Get low stock items (quantity at or below threshold).
     */
    public static function getLowStock(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT i.id, i.menu_item_id, i.quantity, i.low_stock_threshold, i.updated_at,
                   m.name AS item_name, m.price AS item_price, m.image_path AS item_image,
                   c.name AS category_name
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE i.quantity <= i.low_stock_threshold
            ORDER BY i.quantity ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Create a stock movement log entry with audit snapshots.
     */
    public static function createStockMovement(
        int $inventoryId,
        string $type,
        float $qty,
        ?string $reference,
        int $createdBy,
        ?string $notes = null,
        ?float $quantityBefore = null,
        ?float $quantityAfter = null
    ): void {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO stock_movements (inventory_id, movement_type, quantity, quantity_before, quantity_after, reference_id, notes, created_by)
            VALUES (:inv_id, :type, :qty, :qty_before, :qty_after, :ref, :notes, :creator)
        ');
        $stmt->execute([
            'inv_id'     => $inventoryId,
            'type'       => $type,
            'qty'        => $qty,
            'qty_before' => $quantityBefore,
            'qty_after'  => $quantityAfter,
            'ref'        => $reference ?? 'MANUAL',
            'notes'      => $notes,
            'creator'    => $createdBy,
        ]);
    }

    /**
     * Get stock movement history for a menu item.
     */
    public static function getStockHistory(int $menuItemId, int $limit = 50): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT sm.id, sm.movement_type, sm.quantity, sm.quantity_before, sm.quantity_after,
                   sm.reference_id, sm.notes, sm.created_at, sm.created_by,
                   u.full_name AS created_by_name
            FROM stock_movements sm
            JOIN inventory i ON sm.inventory_id = i.id
            LEFT JOIN users u ON sm.created_by = u.id
            WHERE i.menu_item_id = :mid
            ORDER BY sm.created_at DESC
            LIMIT :lim
        ');
        $stmt->bindValue(':mid', $menuItemId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();

        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            $rec['id']              = (int) $rec['id'];
            $rec['quantity']        = (float) $rec['quantity'];
            $rec['quantity_before'] = $rec['quantity_before'] !== null ? (float) $rec['quantity_before'] : null;
            $rec['quantity_after']  = $rec['quantity_after'] !== null ? (float) $rec['quantity_after'] : null;
            $rec['created_by']      = $rec['created_by'] !== null ? (int) $rec['created_by'] : null;
        }

        return $records;
    }

    /**
     * Get recent stock movements across all items for audit/timeline.
     */
    public static function getAllStockMovements(int $limit = 100): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT sm.id, sm.movement_type, sm.quantity, sm.quantity_before, sm.quantity_after,
                   sm.reference_id, sm.notes, sm.created_at, sm.created_by,
                   m.id AS menu_item_id, m.name AS item_name, m.unit_of_measure,
                   u.full_name AS created_by_name
            FROM stock_movements sm
            JOIN inventory i ON sm.inventory_id = i.id
            JOIN menu_items m ON i.menu_item_id = m.id
            LEFT JOIN users u ON sm.created_by = u.id
            ORDER BY sm.created_at DESC
            LIMIT :lim
        ');
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();

        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            $rec['id']              = (int) $rec['id'];
            $rec['menu_item_id']    = (int) $rec['menu_item_id'];
            $rec['quantity']        = (float) $rec['quantity'];
            $rec['quantity_before'] = $rec['quantity_before'] !== null ? (float) $rec['quantity_before'] : null;
            $rec['quantity_after']  = $rec['quantity_after'] !== null ? (float) $rec['quantity_after'] : null;
            $rec['created_by']      = $rec['created_by'] !== null ? (int) $rec['created_by'] : null;
        }

        return $records;
    }

    /**
     * Get inventory summary KPI metrics.
     */
    public static function getSummaryStats(): array
    {
        $db = Database::getConnection();

        $totalTracked = (int) $db->query('
            SELECT COUNT(*) FROM menu_items
            WHERE track_inventory = 1 AND status != "disabled"
        ')->fetchColumn();

        $lowStock = (int) $db->query('
            SELECT COUNT(*) FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE m.track_inventory = 1 AND m.status != "disabled"
              AND i.quantity > 0 AND i.quantity <= i.low_stock_threshold
        ')->fetchColumn();

        $outOfStock = (int) $db->query('
            SELECT COUNT(*) FROM menu_items
            WHERE track_inventory = 1 AND status != "disabled"
              AND quantity_available <= 0
        ')->fetchColumn();

        $movementsToday = (int) $db->query('
            SELECT COUNT(*) FROM stock_movements
            WHERE DATE(created_at) = CURDATE()
        ')->fetchColumn();

        $totalValuation = (float) $db->query('
            SELECT COALESCE(SUM(i.quantity * m.price), 0)
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE m.track_inventory = 1 AND m.status != "disabled"
        ')->fetchColumn();

        return [
            'total_tracked_items' => $totalTracked,
            'low_stock_count'     => $lowStock,
            'out_of_stock_count'  => $outOfStock,
            'movements_today'     => $movementsToday,
            'total_valuation'     => $totalValuation,
        ];
    }

    /**
     * Cast common inventory result types.
     */
    private static function castTypes(array &$rec): void
    {
        $rec['id']                   = (int) $rec['id'];
        $rec['menu_item_id']         = (int) $rec['menu_item_id'];
        $rec['quantity']             = (float) $rec['quantity'];
        $rec['low_stock_threshold']  = (float) $rec['low_stock_threshold'];
        $rec['last_updated_by']      = isset($rec['last_updated_by']) && $rec['last_updated_by'] !== null ? (int) $rec['last_updated_by'] : null;

        if (isset($rec['item_price'])) {
            $rec['item_price'] = (float) $rec['item_price'];
        }

        if (isset($rec['track_inventory'])) {
            $rec['track_inventory'] = (bool) $rec['track_inventory'];
        }
    }
}
