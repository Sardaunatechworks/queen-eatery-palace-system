<?php
/**
 * Queen Eatery Palace - Add Performance Indexes
 * 
 * Safely adds composite indexes to MySQL tables to accelerate frequent queries.
 */

declare(strict_types=1);

define('QEP_APP', true);

require_once __DIR__ . '/api/config/constants.php';
require_once __DIR__ . '/api/config/Database.php';

use App\Config\Database;

try {
    $db = Database::getConnection();
    echo "Connected to database successfully.\n";

    $indexes = [
        [
            'table' => 'orders',
            'name'  => 'idx_payment_order_status',
            'cols'  => 'payment_status, order_status'
        ],
        [
            'table' => 'orders',
            'name'  => 'idx_updated_at',
            'cols'  => 'updated_at'
        ],
        [
            'table' => 'notifications',
            'name'  => 'idx_notif_combined',
            'cols'  => 'user_id, role_target, is_read, created_at'
        ],
        [
            'table' => 'order_items',
            'name'  => 'idx_order_menu',
            'cols'  => 'order_id, menu_item_id'
        ],
        [
            'table' => 'transactions',
            'name'  => 'idx_payment_status',
            'cols'  => 'payment_status'
        ]
    ];

    foreach ($indexes as $idx) {
        $checkStmt = $db->prepare("
            SELECT COUNT(1) 
            FROM information_schema.statistics 
            WHERE table_schema = DATABASE() 
              AND table_name = :table 
              AND index_name = :index
        ");
        $checkStmt->execute(['table' => $idx['table'], 'index' => $idx['name']]);
        $exists = (int)$checkStmt->fetchColumn() > 0;

        if (!$exists) {
            $sql = "ALTER TABLE `{$idx['table']}` ADD INDEX `{$idx['name']}` ({$idx['cols']})";
            $db->exec($sql);
            echo "[ADDED] Index '{$idx['name']}' on table '{$idx['table']}'.\n";
        } else {
            echo "[EXISTS] Index '{$idx['name']}' on table '{$idx['table']}'.\n";
        }
    }

    echo "\nAll performance indexes applied successfully!\n";

} catch (\Throwable $e) {
    echo "\n[ERROR] Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
