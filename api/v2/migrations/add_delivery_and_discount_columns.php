<?php
/**
 * Migration: Add delivery_fee and discount_amount to orders table
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

if (!columnExists($pdo, 'orders', 'delivery_fee')) {
    $pdo->exec("ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER packaging_fee");
    echo "Added delivery_fee column to orders table.\n";
} else {
    echo "delivery_fee column already exists.\n";
}

if (!columnExists($pdo, 'orders', 'discount_amount')) {
    $pdo->exec("ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER delivery_fee");
    echo "Added discount_amount column to orders table.\n";
} else {
    echo "discount_amount column already exists.\n";
}

echo "Migration completed.\n";
