<?php
/**
 * Queen's Palace Eatery & Event Hall - Complete Fresh Database Reset
 * 
 * Safely purges all transactional, historical, and mock records, resets
 * order counters, preserves essential RBAC/System Settings, and creates
 * a single pristine Super Administrator account.
 * 
 * CLI Usage:
 *   php api/v2/fresh_db_reset.php
 */

declare(strict_types=1);

define('QEP_APP', true);

if (PHP_SAPI !== 'cli') {
    die("This script must be executed via CLI only.\n");
}

require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/services/CMSService.php';

use App\Config\Database;

echo "\n============================================================\n";
echo "  QUEEN'S PALACE EATERY - COMPLETE FRESH DATABASE RESET     \n";
echo "============================================================\n\n";

try {
    $db = Database::getConnection();

    // 1. Disable Foreign Key Checks
    echo "[1/7] Disabling foreign key constraints...\n";
    $db->exec('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Tables to truncate
    $tablesToPurge = [
        'order_items',
        'orders',
        'transactions',
        'stock_movements',
        'inventory',
        'menu_items',
        'categories',
        'event_hall_inquiries',
        'notifications',
        'audit_logs',
        'refresh_tokens',
        'password_resets',
        'staff_suspensions',
        'user_permissions',
        'users',
    ];

    echo "[2/7] Purging all operational and mock records...\n";
    foreach ($tablesToPurge as $table) {
        $tableExists = $db->query("SHOW TABLES LIKE '{$table}'")->fetch();
        if ($tableExists) {
            $db->exec("TRUNCATE TABLE `{$table}`");
            echo "  ✓ Truncated `{$table}`\n";
        }
    }

    // 3. Reset Order Counter
    echo "\n[3/7] Resetting order counter to 0...\n";
    $hasCounter = $db->query("SHOW TABLES LIKE 'order_counter'")->fetch();
    if ($hasCounter) {
        $db->exec("TRUNCATE TABLE `order_counter`");
        $db->exec("INSERT INTO `order_counter` (`current_count`) VALUES (0)");
        echo "  ✓ `order_counter` reset to 0 (next order starts at #0001)\n";
    }

    // 4. Ensure RBAC Foundation
    echo "\n[4/7] Verifying Roles and Permissions...\n";
    // Ensure 5 standard roles
    $roles = [
        ['super_admin', 'Super Administrator'],
        ['admin', 'Administrator'],
        ['cashier', 'Cashier'],
        ['kitchen', 'Kitchen Staff'],
        ['customer', 'Customer'],
    ];

    foreach ($roles as [$name, $displayName]) {
        $stmt = $db->prepare('INSERT INTO `roles` (`name`, `display_name`) VALUES (:name, :display) ON DUPLICATE KEY UPDATE `display_name` = VALUES(`display_name`)');
        $stmt->execute(['name' => $name, 'display' => $displayName]);
    }
    echo "  ✓ Standard system roles verified\n";

    // Standard permissions list
    $permissions = [
        ['orders.view', 'orders', 'View Orders', 'View all orders'],
        ['orders.create', 'orders', 'Create Orders', 'Place new orders'],
        ['orders.update_status', 'orders', 'Update Order Status', 'Change order status'],
        ['orders.cancel', 'orders', 'Cancel Orders', 'Cancel orders'],
        ['orders.delete', 'orders', 'Delete Orders', 'Delete orders'],
        ['menu.view', 'menu', 'View Menu', 'View menu items'],
        ['menu.create', 'menu', 'Create Menu Items', 'Add menu items'],
        ['menu.edit', 'menu', 'Edit Menu Items', 'Modify menu items'],
        ['menu.delete', 'menu', 'Delete Menu Items', 'Delete menu items'],
        ['menu.approve', 'menu', 'Approve Menu Items', 'Approve or reject menu items'],
        ['menu.manage_categories', 'menu', 'Manage Categories', 'Manage categories'],
        ['inventory.view', 'inventory', 'View Inventory', 'View inventory levels'],
        ['inventory.adjust', 'inventory', 'Adjust Stock', 'Adjust stock levels'],
        ['transactions.view', 'transactions', 'View Transactions', 'View transactions'],
        ['transactions.export', 'transactions', 'Export Transactions', 'Export transactions'],
        ['reports.view', 'reports', 'View Reports', 'View reports'],
        ['reports.export', 'reports', 'Export Reports', 'Export reports'],
        ['customers.view', 'customers', 'View Customers', 'View customer profiles'],
        ['customers.manage', 'customers', 'Manage Customers', 'Manage customer profiles'],
        ['staff.view', 'staff', 'View Staff', 'View staff accounts'],
        ['staff.create', 'staff', 'Create Staff', 'Create staff accounts'],
        ['staff.edit', 'staff', 'Edit Staff', 'Edit staff accounts'],
        ['staff.suspend', 'staff', 'Suspend Staff', 'Suspend staff accounts'],
        ['staff.delete', 'staff', 'Delete Staff', 'Delete staff accounts'],
        ['staff.reset_password', 'staff', 'Reset Staff Password', 'Reset staff password'],
        ['staff.manage_permissions', 'staff', 'Manage Permissions', 'Manage staff permissions'],
        ['notifications.view', 'notifications', 'View Notifications', 'View notifications'],
        ['notifications.manage', 'notifications', 'Manage Notifications', 'Manage notifications'],
        ['cms.view', 'cms', 'View CMS', 'View CMS content'],
        ['cms.edit', 'cms', 'Edit CMS', 'Edit CMS content'],
        ['event_hall.view_inquiries', 'event_hall', 'View Event Inquiries', 'View event hall inquiries'],
        ['event_hall.manage_inquiries', 'event_hall', 'Manage Event Inquiries', 'Manage event hall inquiries'],
        ['audit.view', 'audit', 'View Audit Logs', 'View audit logs'],
        ['dashboard.view', 'dashboard', 'View Dashboard', 'Access dashboard overview'],
        // Legacy/V1 Aliases
        ['manageInventory', 'inventory', 'Manage Inventory', 'Manage inventory stock levels'],
        ['manageOrders', 'orders', 'Manage Orders', 'View and manage orders'],
        ['manageMenu', 'menu', 'Manage Menu', 'Create, edit, delete menu items'],
        ['manageReports', 'reports', 'Manage Reports', 'Generate and view reports'],
        ['manageCMS', 'cms', 'Manage CMS', 'Edit landing page CMS content'],
        ['manageNotifications', 'notifications', 'Manage Notifications', 'Manage notification system'],
        ['manageStaff', 'staff', 'Manage Staff', 'Create, suspend, delete staff accounts'],
        ['viewDashboard', 'dashboard', 'View Dashboard', 'Access admin dashboard overview'],
    ];

    foreach ($permissions as [$name, $group, $display, $desc]) {
        $stmt = $db->prepare('INSERT INTO `permissions` (`name`, `group_name`, `display_name`, `description`) 
                              VALUES (:name, :group, :display, :desc) 
                              ON DUPLICATE KEY UPDATE `group_name` = VALUES(`group_name`), `display_name` = VALUES(`display_name`), `description` = VALUES(`description`)');
        $stmt->execute(['name' => $name, 'group' => $group, 'display' => $display, 'desc' => $desc]);
    }
    echo "  ✓ Core permissions verified\n";

    // Re-bind role permissions for super_admin & admin
    $db->exec("DELETE FROM `role_permissions` WHERE `role_id` IN (SELECT id FROM roles WHERE name IN ('super_admin', 'admin'))");
    $db->exec("INSERT INTO `role_permissions` (`role_id`, `permission_id`) 
               SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'super_admin'");
    $db->exec("INSERT INTO `role_permissions` (`role_id`, `permission_id`) 
               SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'");

    // Re-bind role permissions for cashier
    $db->exec("DELETE FROM `role_permissions` WHERE `role_id` IN (SELECT id FROM roles WHERE name = 'cashier')");
    $db->exec("INSERT INTO `role_permissions` (`role_id`, `permission_id`) 
               SELECT r.id, p.id FROM roles r, permissions p 
               WHERE r.name = 'cashier' AND p.name IN (
                 'orders.view', 'orders.create', 'orders.update_status',
                 'menu.view', 'inventory.view', 'transactions.view',
                 'notifications.view', 'dashboard.view', 'manageOrders', 'manageNotifications'
               )");

    // Re-bind role permissions for kitchen
    $db->exec("DELETE FROM `role_permissions` WHERE `role_id` IN (SELECT id FROM roles WHERE name = 'kitchen')");
    $db->exec("INSERT INTO `role_permissions` (`role_id`, `permission_id`) 
               SELECT r.id, p.id FROM roles r, permissions p 
               WHERE r.name = 'kitchen' AND p.name IN (
                 'orders.view', 'orders.update_status', 'manageOrders',
                 'menu.view', 'menu.create', 'manageMenu',
                 'inventory.view', 'notifications.view'
               )");
    echo "  ✓ All Role Permissions (Super Admin, Admin, Cashier, Kitchen) synchronized\n";

    // 5. Ensure System Settings
    echo "\n[5/7] Verifying System Settings...\n";
    $hasSettings = $db->query("SHOW TABLES LIKE 'system_settings'")->fetch();
    if ($hasSettings) {
        $stmt = $db->prepare("INSERT INTO `system_settings` (`key_name`, `value`, `display_name`, `description`) 
                              VALUES ('takeaway_pack_price', '300.00', 'Takeaway Pack Price (₦)', 'Configurable unit charge per takeaway container')
                              ON DUPLICATE KEY UPDATE `value` = '300.00'");
        $stmt->execute();
        echo "  ✓ `takeaway_pack_price` set to ₦300.00\n";
    }

    // 5.1 Seed Clean Foundation Categories
    echo "\n[5.1] Seeding clean menu categories...\n";
    $categories = [
        'Rice Dishes',
        'Soups & Swallows',
        'Snacks & Pastries',
        'Drinks & Beverages',
        'Chef Specials',
    ];
    $catStmt = $db->prepare('INSERT INTO `categories` (`name`, `sort_order`, `status`, `created_at`) VALUES (:name, :order, "active", NOW())');
    foreach ($categories as $index => $name) {
        $catStmt->execute(['name' => $name, 'order' => $index + 1]);
    }
    echo "  ✓ 5 Clean categories seeded\n";

    // 5.2 Reset CMS Content (Strictly Zero Hardcoded Image URLs)
    echo "\n[5.2] Resetting CMS Content (zero hardcoded images)...\n";
    $cleanCms = \App\Services\CMSService::getDefaultLandingData();
    $cmsStmt = $db->prepare("
        INSERT INTO `cms_content` (`id`, `section`, `key_name`, `value`, `updated_at`)
        VALUES (1, 'landing_page', 'data', :val, NOW())
        ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()
    ");
    $cmsStmt->execute(['val' => json_encode($cleanCms, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
    echo "  ✓ CMS initialized with zero hardcoded images (ready for admin uploads)\n";

    // 5.3 Reset Restaurant Tables (1 to 10)
    echo "\n[5.3] Initializing clean restaurant tables...\n";
    $db->exec("TRUNCATE TABLE `restaurant_tables`");
    $tblStmt = $db->prepare("
        INSERT INTO `restaurant_tables` (
            `table_number`, `name`, `public_token`, `status`, `qr_enabled`, `current_state`, `created_at`
        ) VALUES (
            :num, :name, :token, 'active', 1, 'available', NOW()
        )
    ");
    for ($i = 1; $i <= 10; $i++) {
        $tableNum = sprintf("Table %02d", $i);
        $token = bin2hex(random_bytes(16));
        $tblStmt->execute([
            'num'   => $tableNum,
            'name'  => "Dine-In {$tableNum}",
            'token' => $token,
        ]);
    }
    echo "  ✓ 10 Clean Restaurant Tables seeded with active QR tokens\n";

    // 6. Create Pristine Super Administrator Account
    echo "\n[6/7] Creating fresh Super Administrator account...\n";
    $superRoleStmt = $db->prepare("SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1");
    $superRoleStmt->execute();
    $superRoleId = (int) $superRoleStmt->fetchColumn();

    $adminEmail = 'admin@queenspalaceeatery.com';
    $rawPassword = 'Admin@Queen2026!';
    $passwordHash = password_hash($rawPassword, PASSWORD_BCRYPT, ['cost' => 12]);

    $insertAdmin = $db->prepare('
        INSERT INTO `users` (
            `full_name`, `email`, `phone`, `password_hash`, `role_id`, `status`, `created_at`, `updated_at`
        ) VALUES (
            :name, :email, :phone, :hash, :role_id, "active", NOW(), NOW()
        )
    ');

    $insertAdmin->execute([
        'name'    => "Queen's Palace Super Admin",
        'email'   => $adminEmail,
        'phone'   => '+2348135549195',
        'hash'    => $passwordHash,
        'role_id' => $superRoleId,
    ]);
    $newAdminId = (int) $db->lastInsertId();

    echo "  ✓ Super Admin created with ID: {$newAdminId}\n";
    echo "    - Email:    {$adminEmail}\n";
    echo "    - Password: {$rawPassword}\n";
    echo "    - Phone:    +234 813 554 9195\n";

    // Create Initial Audit Log Entry
    $auditStmt = $db->prepare('
        INSERT INTO `audit_logs` (
            `user_id`, `action`, `entity_type`, `entity_id`, `description`, `created_at`
        ) VALUES (
            :uid, "system.fresh_reset", "system", "database", "System database wiped and reset to pristine production state", NOW()
        )
    ');
    $auditStmt->execute([
        'uid' => $newAdminId,
    ]);

    // 7. Re-enable Foreign Key Checks
    echo "\n[7/7] Re-enabling foreign key constraints...\n";
    $db->exec('SET FOREIGN_KEY_CHECKS = 1');

    echo "\n============================================================\n";
    echo "  DATABASE RESET COMPLETED SUCCESSFULLY!                    \n";
    echo "============================================================\n\n";

    // Verification Summary
    echo "Final Row Counts:\n";
    $allTables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($allTables as $t) {
        $count = (int) $db->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
        echo "  - `{$t}`: {$count} row(s)\n";
    }

} catch (\Throwable $e) {
    echo "\n[ERROR] Reset failed: " . $e->getMessage() . "\n";
    echo "Line: " . $e->getLine() . " in " . $e->getFile() . "\n";
    exit(1);
}
