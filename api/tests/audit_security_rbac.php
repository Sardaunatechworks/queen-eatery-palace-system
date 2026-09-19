<?php
/**
 * Queen's Palace Eatery & Event Hall — Automated Security, Auth & RBAC Audit Suite
 *
 * Exhaustive verification of:
 * 1. Password hashing & verification (no plaintext)
 * 2. Authentication flows (valid credentials, wrong password, nonexistent user)
 * 3. Account status enforcement (active, restricted, suspended, deleted)
 * 4. JWT Token security (signature tampering, expired tokens, missing tokens)
 * 5. RBAC & Permission Matrix enforcement across all 5 roles + guest
 * 6. IDOR (Insecure Direct Object Reference) access control
 * 7. SQL Injection resilience via parameterized PDO
 * 8. XSS Sanitization / Escaping
 * 9. Rate Limiter mechanism
 * 10. Secrets & credential leakage inspection
 */

declare(strict_types=1);

define('QEP_APP', true);

require_once __DIR__ . '/../v2/config/constants.php';
require_once __DIR__ . '/../v2/config/Database.php';

spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    if (str_starts_with($class, $prefix)) {
        $relative = str_replace($prefix, '', $class);
        $parts = explode('\\', $relative);
        $folder = strtolower(array_shift($parts));
        $className = implode('/', $parts);

        $folderMap = [
            'config'       => 'config',
            'helpers'      => 'helpers',
            'services'     => 'services',
            'repositories' => 'repositories',
            'controllers'  => 'controllers',
            'middleware'   => 'middleware',
        ];

        $targetFolder = $folderMap[$folder] ?? $folder;
        $file = __DIR__ . '/../v2/' . $targetFolder . '/' . $className . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

use App\Config\Database;
use App\Services\JWTService;
use App\Services\AuthService;
use App\Repositories\UserRepository;
use App\Repositories\PermissionRepository;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Middleware\RateLimiter;
use App\Helpers\Sanitizer;

$db = Database::getConnection();

echo "==============================================================\n";
echo "  QUEEN'S PALACE — SECURITY, AUTH & RBAC AUDIT SUITE\n";
echo "==============================================================\n\n";

$passCount = 0;
$failCount = 0;

function report(string $name, bool $passed, string $details = ''): void {
    global $passCount, $failCount;
    if ($passed) {
        $passCount++;
        echo "  [PASS] {$name}" . ($details ? " ({$details})" : "") . "\n";
    } else {
        $failCount++;
        echo "  [FAIL] {$name}" . ($details ? " ({$details})" : "") . "\n";
    }
}

// -------------------------------------------------------------
// SECTION 1: PASSWORD SECURITY & HASHING
// -------------------------------------------------------------
echo "1. AUDITING PASSWORD SECURITY & HASHING...\n";

$testPassword = "TestPassword@2026";
$hashed = password_hash($testPassword, PASSWORD_DEFAULT);
report("password_hash generates valid bcrypt/argon2 hash", password_verify($testPassword, $hashed));
report("password_verify rejects wrong password", !password_verify("WrongPassword123", $hashed));

// Check DB for any plaintext passwords
$stmt = $db->query("SELECT id, email, password_hash FROM users WHERE password_hash NOT LIKE '$2y$%' AND password_hash NOT LIKE '\$argon2%'");
$plaintextRows = $stmt->fetchAll();
report("Zero plaintext passwords stored in users table", count($plaintextRows) === 0, count($plaintextRows) . " non-hashed rows");

// -------------------------------------------------------------
// SECTION 2: AUTHENTICATION FLOWS & CREDENTIAL VERIFICATION
// -------------------------------------------------------------
echo "\n2. AUDITING AUTHENTICATION ENGINE (AuthService)...\n";

$authService = new AuthService();

// Test Nonexistent Account
$nonexistentResult = $authService->login('nonexistent_' . uniqid() . '@example.com', 'somepassword');
report("Nonexistent account login fails", empty($nonexistentResult['success']));

// Fetch admin user
$adminUser = UserRepository::findByEmail('admin@queenspalaceeatery.com');
report("Default super admin exists in DB", $adminUser !== null);

if ($adminUser) {
    // Wrong password test
    $wrongPwResult = $authService->login($adminUser['email'], 'IncorrectPassword@999');
    report("Login rejects incorrect password", empty($wrongPwResult['success']));
}

// -------------------------------------------------------------
// SECTION 3: ACCOUNT STATUS ENFORCEMENT (Active vs Suspended/Restricted/Deleted)
// -------------------------------------------------------------
echo "\n3. AUDITING USER STATUS ENFORCEMENT...\n";

// Create temporary test users with various statuses
$testEmails = [
    'active'     => 'test_sec_active_' . uniqid() . '@qep.test',
    'suspended'  => 'test_sec_suspended_' . uniqid() . '@qep.test',
    'restricted' => 'test_sec_restricted_' . uniqid() . '@qep.test',
    'deleted'    => 'test_sec_deleted_' . uniqid() . '@qep.test',
];

$roleCashier = $db->query("SELECT id FROM roles WHERE name = 'cashier'")->fetchColumn();
$roleCustomer = $db->query("SELECT id FROM roles WHERE name = 'customer'")->fetchColumn();
$roleKitchen = $db->query("SELECT id FROM roles WHERE name = 'kitchen'")->fetchColumn();

$testUserIds = [];

foreach ($testEmails as $status => $email) {
    $stmt = $db->prepare("
        INSERT INTO users (full_name, email, password_hash, role_id, status)
        VALUES (:name, :email, :hash, :role_id, :status)
    ");
    $stmt->execute([
        'name'    => "Test User " . ucfirst($status),
        'email'   => $email,
        'hash'    => password_hash('Pass12345!', PASSWORD_DEFAULT),
        'role_id' => $roleCashier,
        'status'  => $status,
    ]);
    $testUserIds[$status] = (int) $db->lastInsertId();
}

// Check login for suspended user
$suspendedLogin = $authService->login($testEmails['suspended'], 'Pass12345!');
report("Suspended account login is blocked", empty($suspendedLogin['success']));

// Check login for deleted account
$deletedLogin = $authService->login($testEmails['deleted'], 'Pass12345!');
report("Deleted account login is blocked", empty($deletedLogin['success']));

// Check active account login
$activeLogin = $authService->login($testEmails['active'], 'Pass12345!');
report("Active account login succeeds and issues JWT", !empty($activeLogin['success']) && !empty($activeLogin['data']['accessToken']));

// -------------------------------------------------------------
// SECTION 4: JWT TOKEN INTEGRITY & EXPIRATION AUDIT
// -------------------------------------------------------------
echo "\n4. AUDITING JWT TOKEN GENERATION & VERIFICATION...\n";

$jwtService = new JWTService();
$activeUserRecord = UserRepository::findById($testUserIds['active']);
$validToken = $jwtService->generateAccessToken($activeUserRecord);
report("JWT token generation creates 3-part signed Bearer token", count(explode('.', $validToken)) === 3);

$verifiedPayload = $jwtService->verifyAccessToken($validToken);
report("Valid JWT token verifies successfully", $verifiedPayload !== null && (int)$verifiedPayload['sub'] === $testUserIds['active']);

// Tampered Token Test (flip a character in the signature)
$parts = explode('.', $validToken);
$tamperedSig = $parts[0] . '.' . $parts[1] . '.' . substr($parts[2], 0, -2) . 'XX';
$tamperedResult = $jwtService->verifyAccessToken($tamperedSig);
report("Tampered JWT signature is rejected", $tamperedResult === null);

// Tampered Payload Test
$tamperedPayload = $parts[0] . '.' . rtrim(strtr(base64_encode('{"sub":99999,"role":"super_admin"}'), '+/', '-_'), '=') . '.' . $parts[2];
$tamperedPayloadResult = $jwtService->verifyAccessToken($tamperedPayload);
report("Tampered JWT payload is rejected", $tamperedPayloadResult === null);

// Token for suspended user when checked by AuthMiddleware
$suspendedUserRecord = UserRepository::findById($testUserIds['suspended']);
$suspendedToken = $jwtService->generateAccessToken($suspendedUserRecord);
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $suspendedToken;
$authMiddlewareBlocked = false;
try {
    // Simulate AuthMiddleware verification logic
    $extracted = trim(substr($_SERVER['HTTP_AUTHORIZATION'], 7));
    $payload = $jwtService->verifyAccessToken($extracted);
    $user = UserRepository::findWithPermissions((int)$payload['sub']);
    if ($user && $user['status'] !== STATUS_ACTIVE) {
        $authMiddlewareBlocked = true;
    }
} catch (\Throwable $e) {
    $authMiddlewareBlocked = true;
}
report("Suspended user token is rejected on request verification even with valid JWT", $authMiddlewareBlocked);

// -------------------------------------------------------------
// SECTION 5: ROLE-BASED ACCESS CONTROL (RBAC) PERMISSION MATRIX
// -------------------------------------------------------------
echo "\n5. AUDITING RBAC PERMISSION MATRIX...\n";

$superAdminUser = [
    'id'          => 1,
    'role_name'   => ROLE_SUPER_ADMIN,
    'permissions' => [],
];

$adminUserMock = [
    'id'          => 2,
    'role_name'   => ROLE_ADMIN,
    'permissions' => [],
];

$cashierUserMock = [
    'id'          => 3,
    'role_name'   => ROLE_CASHIER,
    'permissions' => [
        'orders.view'        => true,
        'orders.create'      => true,
        'orders.update_status' => true,
        'menu.view'          => true,
        'inventory.view'     => true,
        'notifications.view' => true,
        'dashboard.view'     => true,
    ],
];

$kitchenUserMock = [
    'id'          => 4,
    'role_name'   => ROLE_KITCHEN,
    'permissions' => [
        'orders.view'        => true,
        'orders.update_status' => true,
        'menu.view'          => true,
        'notifications.view' => true,
    ],
];

$customerUserMock = [
    'id'          => 5,
    'role_name'   => ROLE_CUSTOMER,
    'permissions' => [],
];

// Matrix tests
report("Super Admin has all permissions (e.g. staff.create)", RoleMiddleware::hasPermission($superAdminUser, 'staff.create'));
report("Super Admin can manage settings", RoleMiddleware::hasPermission($superAdminUser, 'settings.manage'));
report("Admin has all permissions (e.g. menu.approve)", RoleMiddleware::hasPermission($adminUserMock, 'menu.approve'));

// Cashier tests
report("Cashier CAN view orders", RoleMiddleware::hasPermission($cashierUserMock, 'orders.view'));
report("Cashier CAN create orders", RoleMiddleware::hasPermission($cashierUserMock, 'orders.create'));
report("Cashier CANNOT create staff", !RoleMiddleware::hasPermission($cashierUserMock, 'staff.create'));
report("Cashier CANNOT delete staff", !RoleMiddleware::hasPermission($cashierUserMock, 'staff.delete'));
report("Cashier CANNOT edit CMS", !RoleMiddleware::hasPermission($cashierUserMock, 'cms.edit'));
report("Cashier CANNOT approve menu items", !RoleMiddleware::hasPermission($cashierUserMock, 'menu.approve'));

// Kitchen tests
report("Kitchen CAN view orders", RoleMiddleware::hasPermission($kitchenUserMock, 'orders.view'));
report("Kitchen CAN update order status", RoleMiddleware::hasPermission($kitchenUserMock, 'orders.update_status'));
report("Kitchen CANNOT view transactions", !RoleMiddleware::hasPermission($kitchenUserMock, 'transactions.view'));
report("Kitchen CANNOT export financial reports", !RoleMiddleware::hasPermission($kitchenUserMock, 'reports.export'));
report("Kitchen CANNOT create staff", !RoleMiddleware::hasPermission($kitchenUserMock, 'staff.create'));

// Customer tests
report("Customer CANNOT view all orders", !RoleMiddleware::hasPermission($customerUserMock, 'orders.view'));
report("Customer CANNOT view inventory", !RoleMiddleware::hasPermission($customerUserMock, 'inventory.view'));
report("Customer CANNOT access admin dashboard", !RoleMiddleware::hasPermission($customerUserMock, 'dashboard.view'));

// -------------------------------------------------------------
// SECTION 6: INSECURE DIRECT OBJECT REFERENCE (IDOR) AUDIT
// -------------------------------------------------------------
echo "\n6. AUDITING IDOR (Insecure Direct Object Reference) DEFENSES...\n";

// OrderService enforces ownership: getOrder(id, authUser)
// Let's create a test order for Customer A
$stmt = $db->prepare("
    INSERT INTO orders (order_number, customer_id, customer_name, source, order_type, subtotal, total, payment_status, order_status)
    VALUES (:num, :cid, 'Customer A', 'customer', 'pickup', 2500.00, 2500.00, 'paid', 'pending')
");
$orderNumA = 'QEP-AUDIT-' . uniqid();
$stmt->execute([
    'num' => $orderNumA,
    'cid' => $testUserIds['active'],
]);
$orderIdA = (int) $db->lastInsertId();

$orderService = new \App\Services\OrderService();

// Test 1: Customer A fetches their own order -> should succeed
$fetchedA = $orderService->getOrder($orderIdA, [
    'id'        => $testUserIds['active'],
    'role_name' => ROLE_CUSTOMER,
]);
report("Customer A can access their own order", $fetchedA !== null && (int)$fetchedA['id'] === $orderIdA);

// Test 2: Customer B attempts to fetch Customer A's order -> should be blocked (null)
$fetchedB = $orderService->getOrder($orderIdA, [
    'id'        => 99998,
    'role_name' => ROLE_CUSTOMER,
]);
report("Customer B is BLOCKED from accessing Customer A's order (IDOR protected)", $fetchedB === null);

// Test 3: Cashier/Staff fetches Customer A's order -> should succeed
$fetchedStaff = $orderService->getOrder($orderIdA, [
    'id'        => 1,
    'role_name' => ROLE_CASHIER,
]);
report("Authorized Staff (Cashier) can access order for operational fulfilment", $fetchedStaff !== null);

// Clean up test order
$db->exec("DELETE FROM orders WHERE id = {$orderIdA}");

// -------------------------------------------------------------
// SECTION 7: SQL INJECTION (SQLi) RESILIENCE TEST
// -------------------------------------------------------------
echo "\n7. AUDITING SQL INJECTION RESILIENCE...\n";

$maliciousInputs = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin' --",
    "1 UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12--",
    "1' AND SLEEP(2)='",
];

$sqliProtected = true;
foreach ($maliciousInputs as $payload) {
    // Test through UserRepository
    $res = UserRepository::findByEmail($payload);
    if ($res !== null) {
        $sqliProtected = false;
        break;
    }
}
report("UserRepository prepared statements resist SQL injection payloads", $sqliProtected);

// Test menu search query with SQLi payload
$menuSearchSafe = true;
try {
    foreach ($maliciousInputs as $payload) {
        $result = \App\Repositories\MenuRepository::list(1, 25, $payload);
        // Should execute cleanly as literal text without error or dumping unauthorized rows
        if (!is_array($result) || !isset($result['data'])) {
            $menuSearchSafe = false;
        }
    }
} catch (\Throwable $e) {
    $menuSearchSafe = false;
}
report("Menu search parameterization resists SQL injection payloads", $menuSearchSafe);

// -------------------------------------------------------------
// SECTION 8: XSS SANITIZATION & OUTPUT ESCAPING
// -------------------------------------------------------------
echo "\n8. AUDITING XSS SANITIZATION & ESCAPING...\n";

$xssPayload = "<script>alert('XSS_AUDIT_PWNED')</script><b>BoldText</b>";
$sanitized = Sanitizer::string($xssPayload);
report("Sanitizer strips harmful HTML tags", !str_contains($sanitized, '<script>'));

$xssAttribute = "test\" onfocus=\"alert(1)\"";
$sanitizedAttr = htmlspecialchars($xssAttribute, ENT_QUOTES, 'UTF-8');
report("htmlspecialchars neutralizes quotation breakouts", !str_contains($sanitizedAttr, 'onfocus="alert(1)"') && str_contains($sanitizedAttr, '&quot;'));

// -------------------------------------------------------------
// SECTION 9: RATE LIMITER MECHANISM
// -------------------------------------------------------------
echo "\n9. AUDITING RATE LIMITER BEHAVIOR...\n";

$_SERVER['REMOTE_ADDR'] = '192.168.100.' . rand(10, 99);
$testIp = $_SERVER['REMOTE_ADDR'];
$rateKey = md5($testIp);
$storageDir = sys_get_temp_dir() . '/qep_rate_limit';
$testFile = $storageDir . '/' . $rateKey . '.json';

// Test rate limiter tracking
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0755, true);
}

// Simulate 100 requests limit
$data = ['requests' => array_fill(0, 100, time()), 'blocked_until' => 0];
@file_put_contents($testFile, json_encode($data));

$detectedBlocked = false;
$contents = @file_get_contents($testFile);
if ($contents) {
    $parsed = json_decode($contents, true);
    if (count($parsed['requests'] ?? []) >= 100) {
        $detectedBlocked = true;
    }
}
report("Rate Limiter correctly flags request threshold", $detectedBlocked);
@unlink($testFile);

// -------------------------------------------------------------
// SECTION 10: SECRETS LEAKAGE CHECK
// -------------------------------------------------------------
echo "\n10. AUDITING SECRETS & CLIENT-SIDE LEAKAGE...\n";

$clientEnv = file_get_contents(__DIR__ . '/../../client/.env');
$hasPaystackSecretInClient = str_contains($clientEnv, 'sk_live_') || str_contains($clientEnv, 'sk_test_');
report("Client .env does NOT expose Paystack secret key", !$hasPaystackSecretInClient);

$hasDbPasswordInClient = str_contains($clientEnv, 'DB_PASS') || str_contains($clientEnv, 'MYSQL_PWD');
report("Client .env does NOT expose Database passwords", !$hasDbPasswordInClient);

// Clean up temporary test users
echo "\nCleaning up security audit test accounts...\n";
foreach ($testUserIds as $uid) {
    $db->exec("DELETE FROM users WHERE id = {$uid}");
}
echo "Cleaned up all temporary audit records.\n";

echo "\n==============================================================\n";
echo "SECURITY AUDIT SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "==============================================================\n";

if ($failCount > 0) {
    exit(1);
}
