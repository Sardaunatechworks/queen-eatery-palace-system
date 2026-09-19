<?php
/**
 * Migration: Add Guest QR Table Ordering Module
 *
 * 1. Creates `restaurant_tables` table with unique table_number and cryptographically random public_token.
 * 2. Seeds initial tables (Table 01 through Table 10) with secure tokens if table is empty.
 * 3. Extends `orders` table with:
 *    - `table_id`, `table_number`, `guest_name`, `guest_access_token`, `payment_timing`, `idempotency_token`
 *    - Workflow columns: `accepted_by`, `accepted_at`, `served_at`, `rejected_at`, `rejection_reason`
 *    - Expands `source` and `order_status` enums/columns to support QR guest workflows.
 * 4. Adds permission `tables.manage` to permissions and role_permissions for super_admin and admin.
 * 5. Seeds `qr_payment_policy = 'customer_choice'` in system_settings.
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

function generateSecureTableToken(): string {
    // Generates 8-char uppercase alphanumeric token (e.g., Q8F4K2P7)
    $chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    $len = strlen($chars);
    $token = '';
    $bytes = random_bytes(8);
    for ($i = 0; $i < 8; $i++) {
        $token .= $chars[ord($bytes[$i]) % $len];
    }
    return $token;
}

try {
    echo "--- Starting Migration: Guest QR Table Ordering Module ---\n";

    // 1. Create restaurant_tables table
    echo "1. Creating restaurant_tables table if not exists... ";
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `restaurant_tables` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `table_number` VARCHAR(50) NOT NULL,
            `name` VARCHAR(100) DEFAULT NULL,
            `public_token` VARCHAR(64) NOT NULL,
            `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
            `qr_enabled` TINYINT(1) NOT NULL DEFAULT 1,
            `current_state` ENUM('available', 'occupied', 'disabled') NOT NULL DEFAULT 'available',
            `created_by` INT UNSIGNED DEFAULT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uk_table_number` (`table_number`),
            UNIQUE KEY `uk_public_token` (`public_token`),
            INDEX `idx_table_status` (`status`, `qr_enabled`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "DONE\n";

    // 2. Seed initial tables if table is empty
    $countTables = (int) $pdo->query("SELECT COUNT(*) FROM `restaurant_tables`")->fetchColumn();
    if ($countTables === 0) {
        echo "2. Seeding default tables (Table 01 to Table 10)... ";
        $seedStmt = $pdo->prepare("
            INSERT INTO `restaurant_tables` (`table_number`, `name`, `public_token`, `status`, `qr_enabled`)
            VALUES (:tnum, :name, :token, 'active', 1)
        ");

        for ($i = 1; $i <= 10; $i++) {
            $num = str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            $token = generateSecureTableToken();
            $seedStmt->execute([
                'tnum'  => "Table {$num}",
                'name'  => $i <= 3 ? "VIP Booth {$i}" : "Dine-In Area Table {$num}",
                'token' => $token,
            ]);
        }
        echo "DONE (10 tables seeded)\n";
    } else {
        echo "2. Tables already present ({$countTables} existing tables). Skipping seed.\n";
    }

    // 3. Extend orders table
    echo "3. Extending orders table with QR table ordering fields...\n";

    // Modify `source` column to support 'qr_guest'
    echo "   - Modifying orders.source column... ";
    $pdo->exec("
        ALTER TABLE `orders` 
        MODIFY COLUMN `source` VARCHAR(50) NOT NULL DEFAULT 'customer'
    ");
    echo "DONE\n";

    // Modify `order_status` column to support 'submitted', 'accepted', 'served', 'rejected'
    echo "   - Modifying orders.order_status column... ";
    $pdo->exec("
        ALTER TABLE `orders` 
        MODIFY COLUMN `order_status` VARCHAR(50) NOT NULL DEFAULT 'pending'
    ");
    echo "DONE\n";

    // Add table_id
    if (!columnExists($pdo, 'orders', 'table_id')) {
        echo "   - Adding orders.table_id... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `table_id` INT UNSIGNED DEFAULT NULL AFTER `source`");
        echo "DONE\n";
    }

    // Add table_number (cached snapshot)
    if (!columnExists($pdo, 'orders', 'table_number')) {
        echo "   - Adding orders.table_number... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `table_number` VARCHAR(50) DEFAULT NULL AFTER `table_id`");
        echo "DONE\n";
    }

    // Add guest_name
    if (!columnExists($pdo, 'orders', 'guest_name')) {
        echo "   - Adding orders.guest_name... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `guest_name` VARCHAR(100) DEFAULT NULL AFTER `customer_name`");
        echo "DONE\n";
    }

    // Add guest_access_token (for live tracking without auth)
    if (!columnExists($pdo, 'orders', 'guest_access_token')) {
        echo "   - Adding orders.guest_access_token... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `guest_access_token` VARCHAR(64) DEFAULT NULL AFTER `guest_name`");
        echo "DONE\n";
    }

    // Add payment_timing
    if (!columnExists($pdo, 'orders', 'payment_timing')) {
        echo "   - Adding orders.payment_timing... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `payment_timing` ENUM('before_meal', 'after_meal') DEFAULT 'after_meal' AFTER `payment_method`");
        echo "DONE\n";
    }

    // Add idempotency_token
    if (!columnExists($pdo, 'orders', 'idempotency_token')) {
        echo "   - Adding orders.idempotency_token... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `idempotency_token` VARCHAR(64) DEFAULT NULL AFTER `guest_access_token`");
        echo "DONE\n";
    }

    // Add accepted_by, accepted_at
    if (!columnExists($pdo, 'orders', 'accepted_by')) {
        echo "   - Adding orders.accepted_by and accepted_at... ";
        $pdo->exec("
            ALTER TABLE `orders` 
            ADD COLUMN `accepted_by` INT UNSIGNED DEFAULT NULL AFTER `order_status`,
            ADD COLUMN `accepted_at` DATETIME DEFAULT NULL AFTER `accepted_by`
        ");
        echo "DONE\n";
    }

    // Add served_at
    if (!columnExists($pdo, 'orders', 'served_at')) {
        echo "   - Adding orders.served_at... ";
        $pdo->exec("ALTER TABLE `orders` ADD COLUMN `served_at` DATETIME DEFAULT NULL AFTER `accepted_at`");
        echo "DONE\n";
    }

    // Add rejected_at, rejection_reason
    if (!columnExists($pdo, 'orders', 'rejected_at')) {
        echo "   - Adding orders.rejected_at and rejection_reason... ";
        $pdo->exec("
            ALTER TABLE `orders` 
            ADD COLUMN `rejected_at` DATETIME DEFAULT NULL AFTER `served_at`,
            ADD COLUMN `rejection_reason` VARCHAR(500) DEFAULT NULL AFTER `rejected_at`
        ");
        echo "DONE\n";
    }

    // Add indexes on new order columns
    if (!indexExists($pdo, 'orders', 'idx_table_id')) {
        echo "   - Adding idx_table_id... ";
        $pdo->exec("ALTER TABLE `orders` ADD INDEX `idx_table_id` (`table_id`)");
        echo "DONE\n";
    }

    if (!indexExists($pdo, 'orders', 'idx_guest_access_token')) {
        echo "   - Adding idx_guest_access_token... ";
        $pdo->exec("ALTER TABLE `orders` ADD INDEX `idx_guest_access_token` (`guest_access_token`)");
        echo "DONE\n";
    }

    if (!indexExists($pdo, 'orders', 'idx_idempotency_token')) {
        echo "   - Adding idx_idempotency_token... ";
        $pdo->exec("ALTER TABLE `orders` ADD INDEX `idx_idempotency_token` (`idempotency_token`)");
        echo "DONE\n";
    }

    // 4. Permissions for Tables Management
    echo "4. Checking permissions for tables.manage... ";
    $permStmt = $pdo->prepare("
        INSERT INTO `permissions` (`name`, `group_name`, `display_name`, `description`)
        VALUES ('tables.manage', 'tables', 'Manage Restaurant Tables & QR', 'Add, edit, disable tables and regenerate QR codes')
        ON DUPLICATE KEY UPDATE `display_name` = VALUES(`display_name`), `description` = VALUES(`description`);
    ");
    $permStmt->execute();

    $permId = (int) $pdo->query("SELECT id FROM permissions WHERE name = 'tables.manage'")->fetchColumn();
    $rolesStmt = $pdo->query("SELECT id FROM roles WHERE name IN ('super_admin', 'admin')");
    $roles = $rolesStmt->fetchAll(PDO::FETCH_COLUMN);

    $rolePermStmt = $pdo->prepare("
        INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
        VALUES (:rid, :pid)
    ");
    foreach ($roles as $rid) {
        $rolePermStmt->execute(['rid' => $rid, 'pid' => $permId]);
    }
    echo "DONE\n";

    // 5. System Settings for QR Payment Policy
    echo "5. Seeding system_settings: qr_payment_policy... ";
    $sysStmt = $pdo->prepare("
        INSERT INTO `system_settings` (`key_name`, `value`, `display_name`, `description`)
        VALUES ('qr_payment_policy', 'customer_choice', 'QR Table Ordering Payment Policy', 'Payment timing policy: customer_choice, before_meal, or after_meal')
        ON DUPLICATE KEY UPDATE `display_name` = VALUES(`display_name`), `description` = VALUES(`description`);
    ");
    $sysStmt->execute();
    echo "DONE\n";

    echo "\n=== Migration Completed Successfully! ===\n";

} catch (\Throwable $e) {
    echo "\n[ERROR] Migration failed: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
    exit(1);
}
