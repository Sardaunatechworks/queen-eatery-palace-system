<?php
/**
 * Queen's Palace Eatery & Event Hall — Inventory Schema Migration
 *
 * Idempotent migration that:
 * 1. Adds track_inventory + unit_of_measure to menu_items
 * 2. Alters inventory columns to DECIMAL(12,2)
 * 3. Adds notes, quantity_before, quantity_after to stock_movements
 * 4. Expands movement_type enum & migrates existing data
 * 5. Adds inventory.stock_in permission
 *
 * Safe to run multiple times — every ALTER is guarded by column/type checks.
 */

declare(strict_types=1);

define('QEP_APP', true);
require_once __DIR__ . '/../v2/config/Database.php';

$db = \App\Config\Database::getConnection();

function columnExists(PDO $db, string $table, string $column): bool
{
    $col = $db->quote($column);
    $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE {$col}");
    return (bool) $stmt->fetch();
}

function columnType(PDO $db, string $table, string $column): string
{
    $col = $db->quote($column);
    $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE {$col}");
    $row = $stmt->fetch();
    return $row ? strtolower($row['Type']) : '';
}

function permissionExists(PDO $db, string $name): bool
{
    $stmt = $db->prepare("SELECT COUNT(*) FROM permissions WHERE name = ?");
    $stmt->execute([$name]);
    return (int) $stmt->fetchColumn() > 0;
}

function indexExists(PDO $db, string $table, string $indexName): bool
{
    $name = $db->quote($indexName);
    $stmt = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = {$name}");
    return (bool) $stmt->fetch();
}

$steps = 0;
$skipped = 0;

echo "=== Inventory Schema Migration ===\n\n";

// ─────────────────────────────────────────────────
// 1. menu_items: add track_inventory
// ─────────────────────────────────────────────────
if (!columnExists($db, 'menu_items', 'track_inventory')) {
    $db->exec("ALTER TABLE menu_items ADD COLUMN track_inventory TINYINT(1) NOT NULL DEFAULT 1 AFTER status");
    echo "[OK] Added menu_items.track_inventory\n";
    $steps++;
} else {
    echo "[SKIP] menu_items.track_inventory already exists\n";
    $skipped++;
}

// 2. menu_items: add unit_of_measure
if (!columnExists($db, 'menu_items', 'unit_of_measure')) {
    $db->exec("ALTER TABLE menu_items ADD COLUMN unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'portions' AFTER track_inventory");
    echo "[OK] Added menu_items.unit_of_measure\n";
    $steps++;
} else {
    echo "[SKIP] menu_items.unit_of_measure already exists\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// 3. inventory: quantity → DECIMAL(12,2)
// ─────────────────────────────────────────────────
$qtyType = columnType($db, 'inventory', 'quantity');
if (strpos($qtyType, 'decimal') === false) {
    $db->exec("ALTER TABLE inventory MODIFY COLUMN quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00");
    echo "[OK] Changed inventory.quantity to DECIMAL(12,2)\n";
    $steps++;
} else {
    echo "[SKIP] inventory.quantity is already DECIMAL\n";
    $skipped++;
}

// 4. inventory: low_stock_threshold → DECIMAL(12,2)
$threshType = columnType($db, 'inventory', 'low_stock_threshold');
if (strpos($threshType, 'decimal') === false) {
    $db->exec("ALTER TABLE inventory MODIFY COLUMN low_stock_threshold DECIMAL(12,2) NOT NULL DEFAULT 5.00");
    echo "[OK] Changed inventory.low_stock_threshold to DECIMAL(12,2)\n";
    $steps++;
} else {
    echo "[SKIP] inventory.low_stock_threshold is already DECIMAL\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// 5. stock_movements: add notes
// ─────────────────────────────────────────────────
if (!columnExists($db, 'stock_movements', 'notes')) {
    $db->exec("ALTER TABLE stock_movements ADD COLUMN notes TEXT NULL AFTER reference_id");
    echo "[OK] Added stock_movements.notes\n";
    $steps++;
} else {
    echo "[SKIP] stock_movements.notes already exists\n";
    $skipped++;
}

// 6. stock_movements: add quantity_before
if (!columnExists($db, 'stock_movements', 'quantity_before')) {
    $db->exec("ALTER TABLE stock_movements ADD COLUMN quantity_before DECIMAL(12,2) NULL AFTER quantity");
    echo "[OK] Added stock_movements.quantity_before\n";
    $steps++;
} else {
    echo "[SKIP] stock_movements.quantity_before already exists\n";
    $skipped++;
}

// 7. stock_movements: add quantity_after
if (!columnExists($db, 'stock_movements', 'quantity_after')) {
    $db->exec("ALTER TABLE stock_movements ADD COLUMN quantity_after DECIMAL(12,2) NULL AFTER quantity_before");
    echo "[OK] Added stock_movements.quantity_after\n";
    $steps++;
} else {
    echo "[SKIP] stock_movements.quantity_after already exists\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// 8. stock_movements: expand movement_type enum
// ─────────────────────────────────────────────────
$mvtType = columnType($db, 'stock_movements', 'movement_type');
if (strpos($mvtType, 'stock_in') === false) {
    // First expand the enum to include all old + new values
    $db->exec("ALTER TABLE stock_movements MODIFY COLUMN movement_type ENUM('add','deduction','adjustment','stock_in','wastage','damaged','order_deduct','order_restore','manual_adjust','initial') NOT NULL");
    echo "[OK] Expanded stock_movements.movement_type enum (transitional)\n";

    // Migrate existing data
    $migrated = 0;
    $migrated += $db->exec("UPDATE stock_movements SET movement_type = 'stock_in' WHERE movement_type = 'add'");
    $migrated += $db->exec("UPDATE stock_movements SET movement_type = 'order_deduct' WHERE movement_type = 'deduction'");
    $migrated += $db->exec("UPDATE stock_movements SET movement_type = 'manual_adjust' WHERE movement_type = 'adjustment'");
    echo "[OK] Migrated {$migrated} existing stock movement records\n";

    // Now tighten the enum to new values only
    $db->exec("ALTER TABLE stock_movements MODIFY COLUMN movement_type ENUM('stock_in','wastage','damaged','order_deduct','order_restore','manual_adjust','initial') NOT NULL");
    echo "[OK] Finalized stock_movements.movement_type enum\n";
    $steps++;
} else {
    echo "[SKIP] stock_movements.movement_type already expanded\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// 9. stock_movements: composite index for history queries
// ─────────────────────────────────────────────────
if (!indexExists($db, 'stock_movements', 'idx_inv_created')) {
    $db->exec("CREATE INDEX idx_inv_created ON stock_movements (inventory_id, created_at)");
    echo "[OK] Created index idx_inv_created on stock_movements\n";
    $steps++;
} else {
    echo "[SKIP] Index idx_inv_created already exists\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// 10. permissions: add inventory.stock_in
// ─────────────────────────────────────────────────
if (!permissionExists($db, 'inventory.stock_in')) {
    $db->exec("INSERT INTO permissions (name, group_name, display_name, description) VALUES ('inventory.stock_in', 'inventory', 'Stock In', 'Add stock / restock items')");
    echo "[OK] Added permission: inventory.stock_in\n";
    $steps++;
} else {
    echo "[SKIP] Permission inventory.stock_in already exists\n";
    $skipped++;
}

if (!permissionExists($db, 'inventory.wastage')) {
    $db->exec("INSERT INTO permissions (name, group_name, display_name, description) VALUES ('inventory.wastage', 'inventory', 'Record Wastage', 'Record waste, damaged, or spoilt stock')");
    echo "[OK] Added permission: inventory.wastage\n";
    $steps++;
} else {
    echo "[SKIP] Permission inventory.wastage already exists\n";
    $skipped++;
}

// ─────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────
echo "\n=== Migration Complete ===\n";
echo "Applied: {$steps} | Skipped: {$skipped}\n";
