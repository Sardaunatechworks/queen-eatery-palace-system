<?php
/**
 * Migration: Add Takeaway Packaging Charges & System Settings
 *
 * 1. Creates `system_settings` table and seeds `takeaway_pack_price = 300.00`.
 * 2. Adds `requires_packaging` TINYINT(1) DEFAULT 1 to `menu_items`.
 * 3. Updates drinks / bottled water / beverages to `requires_packaging = 0`.
 * 4. Adds `packaging_quantity`, `packaging_unit_price`, and `packaging_fee` to `orders`.
 * 5. Adds index on `orders(packaging_fee)` for reporting performance.
 */

declare(strict_types=1);

define('QEP_APP', true);
require_once __DIR__ . '/../config/Database.php';

$pdo = \App\Config\Database::getConnection();

function columnExists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :col
    ");
    $stmt->execute(['table' => $table, 'col' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function indexExists(PDO $pdo, string $table, string $indexName): bool {
    $stmt = $pdo->query("SHOW INDEX FROM `{$table}` WHERE Key_name = '{$indexName}'");
    return $stmt->rowCount() > 0;
}

try {
    echo "--- Starting Migration: Takeaway Packaging Charges ---\n";

    // 1. Create system_settings table
    echo "Creating system_settings table if not exists... ";
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `system_settings` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `key_name` VARCHAR(100) NOT NULL UNIQUE,
            `value` TEXT NOT NULL,
            `display_name` VARCHAR(255) DEFAULT NULL,
            `description` VARCHAR(500) DEFAULT NULL,
            `updated_by` INT UNSIGNED DEFAULT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            INDEX `idx_key_name` (`key_name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "DONE\n";

    // Seed takeaway_pack_price = 300.00
    echo "Seeding default takeaway_pack_price = 300.00... ";
    $stmt = $pdo->prepare("
        INSERT INTO `system_settings` (`key_name`, `value`, `display_name`, `description`)
        VALUES ('takeaway_pack_price', '300.00', 'Takeaway Pack Price', 'Cost per takeaway pack container in NGN')
        ON DUPLICATE KEY UPDATE `display_name` = VALUES(`display_name`), `description` = VALUES(`description`);
    ");
    $stmt->execute();
    echo "DONE\n";

    // 2. Add requires_packaging to menu_items
    if (!columnExists($pdo, 'menu_items', 'requires_packaging')) {
        echo "Adding requires_packaging column to menu_items... ";
        $pdo->exec("ALTER TABLE `menu_items` ADD COLUMN `requires_packaging` TINYINT(1) NOT NULL DEFAULT 1 AFTER `price`");
        echo "DONE\n";
    } else {
        echo "Column requires_packaging on menu_items already exists.\n";
    }

    // 3. Mark beverages, water, drinks as requires_packaging = 0
    echo "Updating existing beverages/drinks to requires_packaging = 0... ";
    $updateStmt = $pdo->exec("
        UPDATE `menu_items` SET `requires_packaging` = 0
        WHERE `category_id` IN (
            SELECT id FROM `categories` 
            WHERE LOWER(name) LIKE '%drink%' 
               OR LOWER(name) LIKE '%beverage%'
               OR LOWER(name) LIKE '%juice%'
        )
        OR LOWER(name) LIKE '%water%'
        OR LOWER(name) LIKE '%coke%'
        OR LOWER(name) LIKE '%fanta%'
        OR LOWER(name) LIKE '%sprite%'
        OR LOWER(name) LIKE '%malt%'
        OR LOWER(name) LIKE '%bottle%'
        OR LOWER(name) LIKE '%can %'
        OR LOWER(name) LIKE '%juice%'
        OR LOWER(name) LIKE '%zobo%'
        OR LOWER(name) LIKE '%kunu%'
        OR LOWER(name) LIKE '%tea%'
        OR LOWER(name) LIKE '%coffee%'
    ");
    echo "DONE (updated {$updateStmt} items)\n";

    // 4. Add packaging fields to orders
    if (!columnExists($pdo, 'orders', 'packaging_quantity')) {
        echo "Adding packaging_quantity to orders... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `packaging_quantity` INT NOT NULL DEFAULT 0 AFTER `subtotal`");
        echo "DONE\n";
    } else {
        echo "Column packaging_quantity on orders already exists.\n";
    }

    if (!columnExists($pdo, 'orders', 'packaging_unit_price')) {
        echo "Adding packaging_unit_price to orders... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `packaging_unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `packaging_quantity`");
        echo "DONE\n";
    } else {
        echo "Column packaging_unit_price on orders already exists.\n";
    }

    if (!columnExists($pdo, 'orders', 'packaging_fee')) {
        echo "Adding packaging_fee to orders... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `packaging_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `packaging_unit_price`");
        echo "DONE\n";
    } else {
        echo "Column packaging_fee on orders already exists.\n";
    }

    // 5. Add index on packaging_fee for reporting
    if (!indexExists($pdo, 'orders', 'idx_orders_packaging_fee')) {
        echo "Adding idx_orders_packaging_fee on orders(packaging_fee)... ";
        $pdo->exec("ALTER TABLE `orders` ADD INDEX `idx_orders_packaging_fee` (`packaging_fee`)");
        echo "DONE\n";
    } else {
        echo "Index idx_orders_packaging_fee already exists.\n";
    }

    echo "--- Takeaway Packaging Charges Migration Completed Successfully ---\n";
} catch (\Throwable $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
