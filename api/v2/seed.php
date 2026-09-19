<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Database Seeder
 *
 * Creates the super admin account. Run once after schema setup.
 * Usage: php seed.php
 */

declare(strict_types=1);

require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/repositories/UserRepository.php';
require_once __DIR__ . '/repositories/PermissionRepository.php';

use App\Config\Database;
use App\Repositories\UserRepository;

echo "\n====================================\n";
echo "  Queen's Palace V2 - Database Seeder\n";
echo "====================================\n\n";

try {
    $db = Database::getConnection();
    echo "[OK] Database connection successful.\n\n";
} catch (\Exception $e) {
    echo "[ERROR] " . $e->getMessage() . "\n";
    exit(1);
}

// Super Admin credentials
$superAdminEmail = 'admin@queenspalace.com';
$superAdminPassword = 'SuperAdmin@2024';
$superAdminName = 'Super Administrator';

// Check if super admin exists
$existing = UserRepository::findByEmail($superAdminEmail);

if ($existing) {
    echo "[INFO] Super Admin account already exists.\n";
    echo "  Email: {$superAdminEmail}\n";
    echo "  Role: {$existing['role_name']}\n";
    echo "  Status: {$existing['status']}\n\n";

    // Prompt to reset password
    echo "Reset password? (y/n): ";
    $answer = trim(fgets(STDIN));

    if (strtolower($answer) === 'y') {
        $hash = password_hash($superAdminPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        UserRepository::updatePassword((int) $existing['id'], $hash);
        echo "[OK] Password reset to default.\n\n";
    }
} else {
    // Get super_admin role ID
    $roleId = UserRepository::getRoleId(ROLE_SUPER_ADMIN);

    if (!$roleId) {
        echo "[ERROR] Super Admin role not found in database.\n";
        echo "  Please run schema.sql first.\n\n";
        exit(1);
    }

    $userId = UserRepository::create([
        'full_name'     => $superAdminName,
        'email'         => $superAdminEmail,
        'password_hash' => password_hash($superAdminPassword, PASSWORD_BCRYPT, ['cost' => 12]),
        'role_id'       => $roleId,
        'status'        => STATUS_ACTIVE,
    ]);

    echo "[OK] Super Admin account created.\n";
    echo "  ID: {$userId}\n";
    echo "  Name: {$superAdminName}\n";
    echo "  Email: {$superAdminEmail}\n";
    echo "  Password: {$superAdminPassword}\n";
    echo "  Role: Super Admin\n\n";
}

echo "[IMPORTANT] Change the default password after first login.\n\n";
echo "====================================\n";
echo "  Seeding complete.\n";
echo "====================================\n\n";
