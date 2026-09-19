<?php
/**
 * Migration: Add Performance Indexes for High-Frequency Queries
 */

define('QEP_APP', true);
require_once __DIR__ . '/../config/Database.php';

$pdo = \App\Config\Database::getConnection();

function addIndexIfNotExists(PDO $pdo, string $table, string $indexName, string $columns): void {
    $stmt = $pdo->query("SHOW INDEX FROM `$table` WHERE Key_name = '$indexName'");
    if ($stmt->rowCount() === 0) {
        echo "Adding index $indexName on $table ($columns)... ";
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$indexName` ($columns)");
        echo "DONE\n";
    } else {
        echo "Index $indexName on $table already exists.\n";
    }
}

try {
    echo "--- Applying Database Performance Indexes ---\n";
    addIndexIfNotExists($pdo, 'users', 'idx_users_created_at', '`created_at`');
    addIndexIfNotExists($pdo, 'users', 'idx_users_status', '`status`');
    addIndexIfNotExists($pdo, 'transactions', 'idx_transactions_created_at', '`created_at`');
    addIndexIfNotExists($pdo, 'orders', 'idx_orders_status_created', '`order_status`, `payment_status`, `created_at`');
    addIndexIfNotExists($pdo, 'audit_logs', 'idx_audit_logs_user', '`user_id`');
    echo "--- All Performance Indexes Applied Successfully ---\n";
} catch (\Exception $e) {
    echo "Error applying indexes: " . $e->getMessage() . "\n";
    exit(1);
}
