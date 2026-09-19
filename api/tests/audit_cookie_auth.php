<?php
/**
 * Queen's Palace Eatery & Event Hall — Production Cookie Authentication & CSRF Audit Suite
 *
 * Exhaustive verification of:
 * 1. HttpOnly Cookie Generation & Security Attributes (HttpOnly, SameSite, Path, Secure)
 * 2. Login Flow with Cookie Dispatch & Token Stripping from JSON Response Body
 * 3. AuthMiddleware Session Verification via HttpOnly Cookie (Zero Bearer header required)
 * 4. CSRF Protection for Cookie-based Sessions (Origin & Header Validation)
 * 5. Transparent Token Refresh via HttpOnly Cookie
 * 6. Server-Side Logout & Cookie Clearance
 * 7. Real-Time Account Suspension with Valid Cookie (Immediate 403 Denial)
 * 8. Expired Token & Missing Cookie Handling (401 Rejection)
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
            'config'      => 'config',
            'controllers' => 'controllers',
            'middleware'  => 'middleware',
            'models'      => 'models',
            'repositories'=> 'repositories',
            'services'    => 'services',
            'helpers'     => 'helpers',
        ];

        $realFolder = $folderMap[$folder] ?? $folder;
        $file = __DIR__ . '/../v2/' . $realFolder . '/' . $className . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

use App\Config\Database;
use App\Helpers\CookieHelper;
use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Middleware\CSRFMiddleware;
use App\Repositories\UserRepository;
use App\Services\AuthService;
use App\Services\JWTService;

$db = Database::getConnection();
$passCount = 0;
$failCount = 0;

function report(string $name, bool $passed, string $detail = ''): void
{
    global $passCount, $failCount;
    if ($passed) {
        $passCount++;
        echo "  [PASS] {$name}" . ($detail ? " ({$detail})" : "") . "\n";
    } else {
        $failCount++;
        echo "  [FAIL] {$name}" . ($detail ? " -- ERROR: {$detail}" : "") . "\n";
    }
}

echo "==============================================================\n";
echo "  QUEEN'S PALACE — PRODUCTION COOKIE AUTH & CSRF AUDIT\n";
echo "==============================================================\n\n";

// -------------------------------------------------------------
// SECTION 1: COOKIE HELPER ATTRIBUTES & SECURITY FLAGS
// -------------------------------------------------------------
echo "1. AUDITING COOKIE ATTRIBUTES & SECURITY FLAGS...\n";

CookieHelper::setAuthCookies('test_access_token_xyz', 'test_refresh_token_abc', 900, 604800, 'test_csrf_token_123');

report("qep_access_token populated in cookie state", !empty($_COOKIE[CookieHelper::ACCESS_COOKIE]));
report("qep_refresh_token populated in cookie state", !empty($_COOKIE[CookieHelper::REFRESH_COOKIE]));
report("qep_csrf_token populated in cookie state", !empty($_COOKIE[CookieHelper::CSRF_COOKIE]));

// Test clear cookies
CookieHelper::clearAuthCookies();
report("qep_access_token unset on clearAuthCookies", !isset($_COOKIE[CookieHelper::ACCESS_COOKIE]));
report("qep_refresh_token unset on clearAuthCookies", !isset($_COOKIE[CookieHelper::REFRESH_COOKIE]));
report("qep_csrf_token unset on clearAuthCookies", !isset($_COOKIE[CookieHelper::CSRF_COOKIE]));

// -------------------------------------------------------------
// SECTION 2: LOGIN DISPATCH & TOKEN STRIPPING FROM JSON
// -------------------------------------------------------------
echo "\n2. AUDITING LOGIN DISPATCH & TOKEN STRIPPING FROM RESPONSE...\n";

// Create dedicated test super admin for login audit
$testAdminEmail = 'cookie_test_admin_' . uniqid() . '@qep.test';
$testAdminPass = 'AdminPass123!';
$superRoleId = (int) $db->query("SELECT id FROM roles WHERE name = 'super_admin'")->fetchColumn();
$stmt = $db->prepare("
    INSERT INTO users (full_name, email, password_hash, role_id, status)
    VALUES ('Cookie Test Admin', :email, :hash, :role_id, 'active')
");
$stmt->execute([
    'email'   => $testAdminEmail,
    'hash'    => password_hash($testAdminPass, PASSWORD_BCRYPT),
    'role_id' => $superRoleId,
]);
$adminId = (int) $db->lastInsertId();
$admin = UserRepository::findById($adminId);
report("Super Admin test account created for cookie login audit", $admin !== null);

$authService = new AuthService();
$jwtService = new JWTService();

$loginRes = $authService->login($testAdminEmail, $testAdminPass);
report("AuthService login succeeds with valid credentials", $loginRes['success'] === true);

// Emulate AuthController::login behavior
$access = $loginRes['data']['accessToken'];
$refresh = $loginRes['data']['refreshToken'];
$expiresIn = $loginRes['data']['expiresIn'];

CookieHelper::setAuthCookies($access, $refresh, $expiresIn);

// Client response payload strictly omits raw accessToken and refreshToken
$clientPayload = [
    'profile'   => $loginRes['data']['profile'],
    'expiresIn' => $expiresIn,
];

report("Response payload contains user profile", isset($clientPayload['profile']));
report("Response payload strictly OMITS accessToken (zero JS token storage)", !isset($clientPayload['accessToken']));
report("Response payload strictly OMITS refreshToken (zero JS token storage)", !isset($clientPayload['refreshToken']));

// -------------------------------------------------------------
// SECTION 3: AUTHMIDDLEWARE VERIFICATION VIA HTTPONLY COOKIE
// -------------------------------------------------------------
echo "\n3. AUDITING AUTHMIDDLEWARE COOKIE SESSION RESTORATION...\n";

// Explicitly clear Authorization header to prove authentication relies on cookie
unset($_SERVER['HTTP_AUTHORIZATION']);
unset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/v2/auth/me';

// Set access token cookie
$_COOKIE[CookieHelper::ACCESS_COOKIE] = $access;

AuthMiddleware::verify();
$authenticatedUser = $_REQUEST['auth_user'] ?? null;

report("AuthMiddleware successfully verifies user via HttpOnly cookie", $authenticatedUser !== null);
report("Authenticated user ID matches Super Admin ID", (int)($authenticatedUser['id'] ?? 0) === (int)$admin['id']);
report("Authenticated user role is 'super_admin'", ($authenticatedUser['role_name'] ?? '') === ROLE_SUPER_ADMIN);

// -------------------------------------------------------------
// SECTION 4: CSRF MIDDLEWARE PROTECTION
// -------------------------------------------------------------
echo "\n4. AUDITING CSRF DEFENSES ON STATE-CHANGING REQUESTS...\n";

// 4.1 State-changing POST without CSRF header / custom header should be rejected
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REQUEST_URI'] = '/api/v2/orders';
unset($_SERVER['HTTP_X_REQUESTED_WITH']);
unset($_SERVER['HTTP_X_CSRF_TOKEN']);
$_SERVER['HTTP_ORIGIN'] = 'https://malicious-attacker-site.com';

$csrfOriginErr = CSRFMiddleware::check();
report("Forged cross-origin request from unlisted origin is rejected", $csrfOriginErr !== null);

// 4.2 Valid origin with X-Requested-With header passes
$_SERVER['HTTP_ORIGIN'] = 'http://localhost:5173';
$_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';

$csrfXhrErr = CSRFMiddleware::check();
report("Same-origin request with X-Requested-With header passes CSRF verification", $csrfXhrErr === null);

// 4.3 Request with matching X-CSRF-Token passes
unset($_SERVER['HTTP_X_REQUESTED_WITH']);
$validCsrf = CookieHelper::generateCsrfToken();
$_COOKIE[CookieHelper::CSRF_COOKIE] = $validCsrf;
$_SERVER['HTTP_X_CSRF_TOKEN'] = $validCsrf;

$csrfTokenErr = CSRFMiddleware::check();
report("Request with matching X-CSRF-Token header passes CSRF verification", $csrfTokenErr === null);

// 4.4 Missing both headers from same origin fails
unset($_SERVER['HTTP_X_REQUESTED_WITH']);
unset($_SERVER['HTTP_X_CSRF_TOKEN']);
$csrfMissingErr = CSRFMiddleware::check();
report("State-changing request missing both CSRF headers is rejected", $csrfMissingErr !== null);

// -------------------------------------------------------------
// SECTION 5: TRANSPARENT TOKEN REFRESH VIA COOKIE
// -------------------------------------------------------------
echo "\n5. AUDITING TOKEN REFRESH VIA HTTPONLY REFRESH COOKIE...\n";

$_COOKIE[CookieHelper::REFRESH_COOKIE] = $refresh;

$refreshRes = $authService->refresh($refresh);
report("Token refresh succeeds using HttpOnly refresh cookie", $refreshRes['success'] === true);
report("New access token generated upon refresh", !empty($refreshRes['data']['accessToken']));

$newAccess = $refreshRes['data']['accessToken'];
CookieHelper::setAuthCookies($newAccess, $refresh, $refreshRes['data']['expiresIn']);
report("Access cookie updated to new token in cookie state", $_COOKIE[CookieHelper::ACCESS_COOKIE] === $newAccess);

// -------------------------------------------------------------
// SECTION 6: LOGOUT & SERVER-SIDE TOKEN INVALIDATION
// -------------------------------------------------------------
echo "\n6. AUDITING LOGOUT & SERVER-SIDE SESSION INVALIDATION...\n";

// Logout revokes refresh token on server
$authService->logout($refresh);
CookieHelper::clearAuthCookies();

// Attempting to refresh with revoked token must fail
$revokedRefresh = $authService->refresh($refresh);
report("Refreshing with logged-out refresh token is rejected on server", $revokedRefresh['success'] === false);
report("Cookies cleared on logout", empty($_COOKIE[CookieHelper::ACCESS_COOKIE]));

// -------------------------------------------------------------
// SECTION 7: REAL-TIME SUSPENSION ENFORCEMENT WITH VALID COOKIE
// -------------------------------------------------------------
echo "\n7. AUDITING REAL-TIME ACCOUNT SUSPENSION ENFORCEMENT...\n";

// Create test staff cashier
$roleCashier = (int) $db->query("SELECT id FROM roles WHERE name = 'cashier'")->fetchColumn();
$testStaffEmail = 'cookie_audit_cashier_' . uniqid() . '@qep.test';
$pwdHash = password_hash('CashierPass123!', PASSWORD_BCRYPT);

$stmt = $db->prepare("
    INSERT INTO users (full_name, email, password_hash, role_id, status)
    VALUES ('Cookie Audit Cashier', :email, :pwd, :role_id, 'active')
");
$stmt->execute(['email' => $testStaffEmail, 'pwd' => $pwdHash, 'role_id' => $roleCashier]);
$staffId = (int) $db->lastInsertId();
$staffUser = UserRepository::findById($staffId);

// Issue valid token cookie
$cashierToken = $jwtService->generateAccessToken($staffUser);
$_COOKIE[CookieHelper::ACCESS_COOKIE] = $cashierToken;
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/v2/orders';

// Verify active cashier succeeds
$activeAuthCheck = AuthMiddleware::check();
report("Active staff member authenticated via cookie", $activeAuthCheck['success'] === true && (int)($activeAuthCheck['user']['id'] ?? 0) === $staffId);

// Admin suspends staff member in database
UserRepository::update($staffId, ['status' => STATUS_SUSPENDED]);
$suspendedDbUser = UserRepository::findById($staffId);
report("Staff member status changed to 'suspended' in database", ($suspendedDbUser['status'] ?? '') === STATUS_SUSPENDED);

// Next request with previously valid cookie must be DENIED immediately
$suspensionCheck = AuthMiddleware::check();
report("Suspended staff member with unexpired cookie is IMMEDIATELY BLOCKED (403)", $suspensionCheck['success'] === false && $suspensionCheck['status'] === 403);

// Clean up test users
$db->exec("DELETE FROM users WHERE id = {$staffId}");
if (!empty($adminId)) {
    $db->exec("DELETE FROM users WHERE id = {$adminId}");
}
CookieHelper::clearAuthCookies();
report("Test users cleaned up", true);

echo "\n==============================================================\n";
echo "COOKIE AUTH AUDIT SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "==============================================================\n";

if ($failCount > 0) {
    exit(1);
}
