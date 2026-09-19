<?php
/**
 * Queen Eatery Palace - Admin Seeder Script
 * 
 * Creates the initial super admin account.
 * 
 * USAGE (CLI):
 *   php seed_admin.php
 * 
 * USAGE (phpMyAdmin import):
 *   Run the generated SQL INSERT statement via phpMyAdmin.
 * 
 * SECURITY:
 *   - Password is prompted interactively (not hardcoded)
 *   - If no CLI available, password can be supplied via QEP_ADMIN_PASSWORD env var
 *   - This script should NEVER be committed with a real password
 *   - Delete or restrict access after running
 */

declare(strict_types=1);

define('QEP_APP', true);

// Determine if running in CLI mode
$isCli = php_sapi_name() === 'cli';

if (!$isCli) {
    // Block web access entirely
    http_response_code(403);
    echo "This script can only be run from the command line.";
    exit(1);
}

echo "====================================================\n";
echo "  Queen's Palace Eatery - Super Admin Seeder\n";
echo "====================================================\n\n";

// Load config
require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';

use App\Config\Database;

// Helper to read interactive input safely
function getCliInput(string $prompt): string {
    echo $prompt;
    $input = '';
    while ($input === '') {
        $line = fgets(STDIN);
        if ($line === false) break;
        $input = trim($line);
    }
    return $input;
}

// Check CLI arguments or environment variable
$password = $argv[1] ?? getenv('QEP_ADMIN_PASSWORD') ?: '';
$adminEmail = $argv[2] ?? getenv('QEP_ADMIN_EMAIL') ?: 'admin@queenspalaceeatery.com';

if (empty($password)) {
    $password = getCliInput("Enter password for {$adminEmail}: ");
    
    if (strlen($password) < 8) {
        echo "ERROR: Password must be at least 8 characters.\n";
        exit(1);
    }

    $confirm = getCliInput("Confirm password: ");
    if ($password !== $confirm) {
        echo "ERROR: Passwords do not match.\n";
        exit(1);
    }
} else {
    if (strlen($password) < 8) {
        echo "ERROR: Password must be at least 8 characters.\n";
        exit(1);
    }
}

try {
    $db = Database::getConnection();

    // Determine target admin email
    $adminEmail = getenv('QEP_ADMIN_EMAIL') ?: 'admin@queenspalace.com';

    // Check if is_super_admin column exists (V1 vs V2 schema detection)
    $colCheck = $db->query("SHOW COLUMNS FROM users LIKE 'is_super_admin'")->fetch();
    $isV1Schema = !empty($colCheck);

    // Find appropriate super admin role
    $roleName = $isV1Schema ? 'admin' : 'super_admin';
    $stmt = $db->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
    $stmt->execute(['name' => $roleName]);
    $roleRow = $stmt->fetch();

    if (!$roleRow && !$isV1Schema) {
        // Fallback check for admin role
        $stmt->execute(['name' => 'admin']);
        $roleRow = $stmt->fetch();
    }

    if (!$roleRow) {
        echo "ERROR: Required role ('{$roleName}') not found. Please run schema.sql first.\n";
        exit(1);
    }

    $roleId = (int) $roleRow['id'];
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    // Check if admin already exists
    $stmt = $db->prepare('SELECT id, full_name, email, role_id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $adminEmail]);
    $existingAdmin = $stmt->fetch();

    if ($existingAdmin) {
        echo "\n⚠️  Admin account already exists ({$adminEmail}).\n";
        echo "Reset password to the newly entered password? (y/n): ";
        $ans = trim(fgets(STDIN));
        if (strtolower($ans) === 'y') {
            $update = $db->prepare('UPDATE users SET password_hash = :hash, role_id = :role_id, status = :status WHERE id = :id');
            $update->execute([
                'hash'    => $passwordHash,
                'role_id' => $roleId,
                'status'  => STATUS_ACTIVE,
                'id'      => $existingAdmin['id'],
            ]);
            echo "\n✅ Super Admin password reset successfully!\n";
        } else {
            echo "Password was not changed.\n";
        }
        exit(0);
    }

    // Insert the super admin
    if ($isV1Schema) {
        $stmt = $db->prepare('
            INSERT INTO users (full_name, email, phone, password_hash, role_id, status, is_super_admin)
            VALUES (:name, :email, :phone, :hash, :role_id, :status, :super)
        ');
        $stmt->execute([
            'name'    => 'Super Administrator',
            'email'   => $adminEmail,
            'phone'   => '+2349155290102',
            'hash'    => $passwordHash,
            'role_id' => $roleId,
            'status'  => STATUS_ACTIVE,
            'super'   => 1,
        ]);
    } else {
        $stmt = $db->prepare('
            INSERT INTO users (full_name, email, phone, password_hash, role_id, status)
            VALUES (:name, :email, :phone, :hash, :role_id, :status)
        ');
        $stmt->execute([
            'name'    => 'Super Administrator',
            'email'   => $adminEmail,
            'phone'   => '+2349155290102',
            'hash'    => $passwordHash,
            'role_id' => $roleId,
            'status'  => STATUS_ACTIVE,
        ]);
    }

    $adminId = (int) $db->lastInsertId();

    echo "\n✅ Super Admin account created successfully!\n";
    echo "   ID:     {$adminId}\n";
    echo "   Email:  {$adminEmail}\n";
    echo "   Role:   {$roleName}\n";
    echo "   Schema: " . ($isV1Schema ? 'V1 (Legacy)' : 'V2 (RBAC)') . "\n";
    echo "\n⚠️  IMPORTANT: Delete or restrict access to this script after use.\n";

    // Generate a SQL statement for phpMyAdmin import as fallback
    echo "\n--- phpMyAdmin SQL (alternative method) ---\n";
    if ($isV1Schema) {
        echo "INSERT INTO users (full_name, email, phone, password_hash, role_id, status, is_super_admin)\n";
        echo "VALUES ('Super Administrator', '{$adminEmail}', '+2349155290102', '{$passwordHash}', {$roleId}, 'active', 1);\n";
    } else {
        echo "INSERT INTO users (full_name, email, phone, password_hash, role_id, status)\n";
        echo "VALUES ('Super Administrator', '{$adminEmail}', '+2349155290102', '{$passwordHash}', {$roleId}, 'active');\n";
    }
    echo "-------------------------------------------\n";

} catch (\Throwable $e) {
    echo "\n❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
