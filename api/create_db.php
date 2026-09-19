<?php
/**
 * Queen Eatery Palace - Database Creator & Schema Importer
 * 
 * Creates the MySQL database and imports schema.sql using PDO.
 */

declare(strict_types=1);

// Set application identity so config doesn't block loading
define('QEP_APP', true);

$config = require __DIR__ . '/private/config.php';
$dbConfig = $config['db'];

try {
    // 1. Connect to MySQL server without a database target
    $dsn = "mysql:host=" . $dbConfig['host'] . ";port=" . $dbConfig['port'] . ";charset=utf8mb4";
    $pdo = new PDO($dsn, $dbConfig['user'], $dbConfig['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    echo "Connecting to MySQL server...\n";

    // 2. Create database
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . $dbConfig['name'] . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Database `" . $dbConfig['name'] . "` created successfully.\n";

    // 3. Connect to the database and run schema.sql
    $pdo->exec("USE `" . $dbConfig['name'] . "`");
    
    $schemaFile = __DIR__ . '/schema.sql';
    if (!file_exists($schemaFile)) {
        throw new Exception("schema.sql not found at " . $schemaFile);
    }

    $sql = file_get_contents($schemaFile);
    
    echo "Importing schema tables and roles...\n";
    $pdo->exec($sql);
    echo "Schema imported successfully!\n";

} catch (Exception $e) {
    echo "\n[ERROR] Setup failed: " . $e->getMessage() . "\n";
    exit(1);
}
