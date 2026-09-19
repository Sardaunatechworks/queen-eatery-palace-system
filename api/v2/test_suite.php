<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 System Diagnostics & Health Check Suite
 *
 * Usage:
 *   php api/v2/test_suite.php
 */

declare(strict_types=1);

define('QEP_APP', true);

require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';

use App\Config\Database;

echo "\n=========================================================\n";
echo "  Queen's Palace V2 - System Diagnostics & Health Suite  \n";
echo "=========================================================\n\n";

$allPassed = true;

function pass(string $msg): void {
    echo "  [PASS] {$msg}\n";
}

function fail(string $msg, ?string $hint = null): void {
    global $allPassed;
    $allPassed = false;
    echo "  [FAIL] {$msg}\n";
    if ($hint) {
        echo "         -> Hint: {$hint}\n";
    }
}

function info(string $msg): void {
    echo "  [INFO] {$msg}\n";
}

// 1. PHP Version & Extensions Check
echo "1. Checking PHP Environment...\n";
$phpVer = PHP_VERSION;
if (version_compare($phpVer, '8.0.0', '>=')) {
    pass("PHP version is {$phpVer} (>= 8.0 required)");
} else {
    fail("PHP version {$phpVer} is lower than 8.0.0", "Upgrade to PHP 8.1 or 8.2");
}

$requiredExtensions = ['pdo', 'pdo_mysql', 'openssl', 'json', 'mbstring'];
foreach ($requiredExtensions as $ext) {
    if (extension_loaded($ext)) {
        pass("Extension '{$ext}' is installed and active.");
    } else {
        fail("Extension '{$ext}' is MISSING", "Enable php-{$ext} in php.ini");
    }
}

// 2. Configuration & .env
echo "\n2. Checking Configuration & Credentials...\n";
try {
    $fullConfig = Database::getFullConfig();
    pass("Configuration file successfully loaded.");
    
    $dbConfig = $fullConfig['db'] ?? [];
    info("Database Host: " . ($dbConfig['host'] ?? 'N/A'));
    info("Database Name: " . ($dbConfig['name'] ?? 'N/A'));
    info("Database User: " . ($dbConfig['user'] ?? 'N/A'));
    
    $jwtSecret = $fullConfig['jwt']['secret'] ?? '';
    if (empty($jwtSecret) || $jwtSecret === 'CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_64_CHARS') {
        fail("JWT Secret is using default placeholder", "Set a unique 64-char JWT_SECRET in your .env or private/config.php");
    } else {
        pass("JWT Secret is configured.");
    }
} catch (\Throwable $e) {
    fail("Failed to load configuration: " . $e->getMessage(), "Verify api/private/config.php or api/.env exists.");
}

// 3. Database Connectivity & Tables
echo "\n3. Checking Database Connectivity & Schema...\n";
try {
    $db = Database::getConnection();
    pass("Database connection established successfully.");

    $expectedTables = [
        'roles',
        'permissions',
        'role_permissions',
        'users',
        'user_permissions',
        'refresh_tokens',
        'categories',
        'menu_items',
        'inventory',
        'orders',
        'order_items',
        'transactions',
        'event_hall_inquiries',
        'cms_content',
        'notifications',
        'audit_logs'
    ];

    $stmt = $db->query("SHOW TABLES");
    $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $missingTables = array_diff($expectedTables, $existingTables);
    if (empty($missingTables)) {
        pass("All " . count($expectedTables) . " core V2 tables exist in the database.");
    } else {
        fail("Missing tables: " . implode(', ', $missingTables), "Run api/v2/schema.sql in your MySQL database.");
    }

    // 4. Seed Data Verification
    echo "\n4. Checking System Roles & Admin Account...\n";
    $roleStmt = $db->query("SELECT name FROM roles");
    $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('super_admin', $roles)) {
        pass("Role 'super_admin' exists.");
    } else {
        fail("Role 'super_admin' missing", "Import api/v2/schema.sql to populate roles.");
    }

    $adminStmt = $db->prepare("
        SELECT u.id, u.full_name, u.email, r.name as role_name 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE r.name = 'super_admin' AND u.status = 'active'
        LIMIT 1
    ");
    $adminStmt->execute();
    $admin = $adminStmt->fetch();

    if ($admin) {
        pass("Super Admin account found: {$admin['full_name']} ({$admin['email']})");
    } else {
        fail("No active Super Admin found", "Run: php api/v2/seed.php (or php api/seed_admin.php)");
    }

    // 5. CMS Default Content
    echo "\n5. Checking CMS & Menu Data...\n";
    $menuCountStmt = $db->query("SELECT COUNT(*) FROM menu_items");
    $menuCount = (int) $menuCountStmt->fetchColumn();
    info("Total Menu Items: {$menuCount}");

    $categoryCountStmt = $db->query("SELECT COUNT(*) FROM categories");
    $categoryCount = (int) $categoryCountStmt->fetchColumn();
    info("Total Categories: {$categoryCount}");

    $inquiryCountStmt = $db->query("SELECT COUNT(*) FROM event_hall_inquiries");
    $inquiryCount = (int) $inquiryCountStmt->fetchColumn();
    info("Total Event Hall Inquiries: {$inquiryCount}");

} catch (\Throwable $e) {
    fail("Database error: " . $e->getMessage(), "Check database credentials in .env or config.php");
}

echo "\n=========================================================\n";
if ($allPassed) {
    echo "  🎉 ALL DIAGNOSTIC CHECKS PASSED!\n";
    echo "  Queen's Palace V2 is fully configured and ready.\n";
} else {
    echo "  ⚠️  SOME CHECKS REQUIRE ATTENTION (see hints above).\n";
}
echo "=========================================================\n\n";
