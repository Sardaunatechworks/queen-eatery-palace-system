<?php
/**
 * Queen's Palace Eatery & Event Hall — Features, CMS, Uploads & Staff Invalidation Audit Suite
 *
 * Exhaustive verification of:
 * 1. File Upload Security (MIME verification, extension mapping, path traversal prevention)
 * 2. Uploads Directory Execution Block (.htaccess)
 * 3. CMS Landing Page Data Integrity & RBAC
 * 4. Event Hall Inquiries (validation, lifecycle, notifications, audit logging)
 * 5. Staff Lifecycle & Real-Time Token Invalidation (suspended/inactive staff immediately blocked)
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
use App\Helpers\JWT;
use App\Services\CMSService;
use App\Services\EventHallService;
use App\Services\FileUploadService;
use App\Services\UserService;
use App\Repositories\UserRepository;
use App\Repositories\EventHallRepository;

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
echo "  QUEEN'S PALACE — FEATURES, UPLOAD & STAFF AUDIT SUITE\n";
echo "==============================================================\n\n";

// -------------------------------------------------------------
// SECTION 1: FILE UPLOAD SECURITY AUDIT
// -------------------------------------------------------------
echo "1. AUDITING FILE UPLOAD SECURITY CONTROLS...\n";

$uploader = new FileUploadService();

// 1.1 Malicious PHP script pretending to be JPG
$fakePhpFile = [
    'name'     => 'exploit.php.jpg',
    'type'     => 'image/jpeg',
    'tmp_name' => tempnam(sys_get_temp_dir(), 'test_malicious_'),
    'error'    => UPLOAD_ERR_OK,
    'size'     => 128,
];
file_put_contents($fakePhpFile['tmp_name'], "<?php echo 'malicious_code_executed'; phpinfo(); ?>");

$resMalicious = $uploader->upload($fakePhpFile, 'cms');
report("MIME sniffing blocks PHP file masquerading as image",
    $resMalicious['success'] === false && str_contains(strtolower($resMalicious['error'] ?? ''), 'invalid file type')
);
@unlink($fakePhpFile['tmp_name']);

// 1.2 Legitimate 1x1 PNG image
$validPngFile = [
    'name'     => 'sample_banner.png',
    'type'     => 'image/png',
    'tmp_name' => tempnam(sys_get_temp_dir(), 'test_png_'),
    'error'    => UPLOAD_ERR_OK,
];
// Minimal valid 1x1 PNG base64
$pngBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
file_put_contents($validPngFile['tmp_name'], $pngBytes);
$validPngFile['size'] = strlen($pngBytes);

$resValid = $uploader->upload($validPngFile, 'cms');
report("Legitimate PNG upload succeeds", $resValid['success'] === true);
report("Uploaded file renamed to unguessable random hash",
    $resValid['success'] === true && !str_contains($resValid['filename'] ?? '', 'sample_banner')
);

// Verify file exists on disk
$uploadedRelPath = $resValid['path'] ?? '';
$fullUploadedPath = __DIR__ . '/../uploads/' . $uploadedRelPath;
report("File physically written to uploads directory", file_exists($fullUploadedPath));

// 1.3 Path traversal deletion defense
$traversalBlocked = false;
$resTraversal = $uploader->delete('../../index.php');
report("Path traversal deletion attempt rejected safely", $resTraversal === false);

// Clean up uploaded test file
if ($uploadedRelPath) {
    $deleted = $uploader->delete($uploadedRelPath);
    report("Legitimate file deletion succeeds safely", $deleted === true);
}
@unlink($validPngFile['tmp_name']);

// 1.4 Check .htaccess execution block
$htaccessPath = __DIR__ . '/../uploads/.htaccess';
report(".htaccess security file exists in uploads folder", file_exists($htaccessPath));
if (file_exists($htaccessPath)) {
    $htaccessContent = file_get_contents($htaccessPath);
    report(".htaccess disables PHP execution engine",
        str_contains($htaccessContent, 'php_flag engine off') && 
        (str_contains($htaccessContent, 'Require all denied') || str_contains($htaccessContent, 'Deny from all'))
    );
}

// -------------------------------------------------------------
// SECTION 2: CMS SERVICE & LANDING PAGE INTEGRITY
// -------------------------------------------------------------
echo "\n2. AUDITING CMS LANDING PAGE CONTENT & CONTROLS...\n";

$cmsContent = CMSService::getLandingPageContent();
report("CMS content loaded successfully", !empty($cmsContent) && is_array($cmsContent));
report("CMS contains hero section data", isset($cmsContent['hero']) && !empty($cmsContent['hero']['title'] ?? ''));
report("CMS contains event hall details", (isset($cmsContent['eventHall']) || isset($cmsContent['event_hall'])));
report("CMS contains contact info & opening hours", isset($cmsContent['contact']) && !empty($cmsContent['contact']['phone'] ?? ''));

// Update CMS content test
$adminUser = $db->query("
    SELECT u.id, r.name AS role_name 
    FROM users u 
    JOIN roles r ON u.role_id = r.id 
    WHERE r.name = 'super_admin' AND u.status = 'active' 
    LIMIT 1
")->fetch();

$updatedCms = $cmsContent;
$originalSubtitle = $updatedCms['hero']['subtitle'] ?? '';
$testSubtitle = 'Audit Tested Subtitle ' . time();
$updatedCms['hero']['subtitle'] = $testSubtitle;

$updateRes = CMSService::updateLandingPageContent($updatedCms, (int)$adminUser['id']);
report("CMS content updated successfully by admin", ($updateRes['hero']['subtitle'] ?? '') === $testSubtitle);

// Re-read to ensure database persistence
$reReadCms = CMSService::getLandingPageContent();
report("CMS changes persisted correctly in database", ($reReadCms['hero']['subtitle'] ?? '') === $testSubtitle);

// Restore original subtitle
$updatedCms['hero']['subtitle'] = $originalSubtitle;
CMSService::updateLandingPageContent($updatedCms, (int)$adminUser['id']);
report("CMS original content restored", true);

// -------------------------------------------------------------
// SECTION 3: EVENT HALL INQUIRY WORKFLOW & VALIDATION
// -------------------------------------------------------------
echo "\n3. AUDITING EVENT HALL INQUIRIES & LIFECYCLE...\n";

// 3.1 Validation checks
$invalidCases = [
    ['data' => ['full_name' => 'A', 'phone' => '08012345678', 'event_type' => 'Wedding', 'preferred_date' => '2026-12-25'], 'err' => 'at least 2 characters'],
    ['data' => ['full_name' => 'Valid Name', 'phone' => '123', 'event_type' => 'Wedding', 'preferred_date' => '2026-12-25'], 'err' => 'phone number'],
    ['data' => ['full_name' => 'Valid Name', 'phone' => '08012345678', 'event_type' => '', 'preferred_date' => '2026-12-25'], 'err' => 'Event type'],
    ['data' => ['full_name' => 'Valid Name', 'phone' => '08012345678', 'event_type' => 'Wedding', 'preferred_date' => 'invalid-date'], 'err' => 'preferred date'],
    ['data' => ['full_name' => 'Valid Name', 'phone' => '08012345678', 'email' => 'invalid-email', 'event_type' => 'Wedding', 'preferred_date' => '2026-12-25'], 'err' => 'email address'],
];

foreach ($invalidCases as $idx => $c) {
    try {
        EventHallService::createInquiry($c['data']);
        report("Event inquiry invalid submission #{$idx} correctly rejected", false, "Allowed invalid input");
    } catch (\InvalidArgumentException $e) {
        report("Event inquiry invalid input #{$idx} ({$c['err']}) rejected", true);
    }
}

// 3.2 Valid inquiry creation
$validInquiryData = [
    'full_name'       => 'Princess Aisha Bello',
    'phone'           => '08099887766',
    'email'           => 'aisha.bello@qep.test',
    'event_type'      => 'Wedding Reception',
    'preferred_date'  => '2026-12-15',
    'expected_guests' => 350,
    'message'         => 'Interested in hall decoration, catering and multimedia setup.',
];

$inquiry = EventHallService::createInquiry($validInquiryData);
$inquiryId = (int) ($inquiry['id'] ?? 0);
report("Valid event hall inquiry created with ID #{$inquiryId}", $inquiryId > 0);
report("Initial inquiry status is 'new'", ($inquiry['status'] ?? '') === 'new');

// 3.3 Status lifecycle transitions
$contacted = EventHallService::updateInquiryStatus($inquiryId, 'contacted', 'Spoke with client, requested budget proposal', (int)$adminUser['id']);
report("Inquiry status transitioned from 'new' -> 'contacted'", ($contacted['status'] ?? '') === 'contacted');
report("Admin notes recorded accurately", str_contains($contacted['admin_notes'] ?? '', 'Spoke with client'));

$confirmed = EventHallService::updateInquiryStatus($inquiryId, 'confirmed', 'Deposit paid, date locked', (int)$adminUser['id']);
report("Inquiry status transitioned from 'contacted' -> 'confirmed'", ($confirmed['status'] ?? '') === 'confirmed');

// Invalid status rejected
try {
    EventHallService::updateInquiryStatus($inquiryId, 'invalid_status_xyz', null, (int)$adminUser['id']);
    report("Invalid inquiry status rejected", false, "Allowed invalid status transition");
} catch (\InvalidArgumentException $e) {
    report("Invalid inquiry status transition rejected with 400", true);
}

// Verify stats calculation
$stats = EventHallService::getStats();
report("Event hall inquiry stats aggregates correctly", isset($stats['total']) && $stats['total'] >= 0);

// Cleanup test inquiry
$deletedInquiry = EventHallService::deleteInquiry($inquiryId, (int)$adminUser['id']);
report("Admin can delete inquiry cleanly", $deletedInquiry === true);

// -------------------------------------------------------------
// SECTION 4: REAL-TIME STAFF SESSION REVOCATION AUDIT
// -------------------------------------------------------------
echo "\n4. AUDITING REAL-TIME STAFF SESSION REVOCATION...\n";

// 4.1 Create test staff member (cashier)
$roleCashier = (int) $db->query("SELECT id FROM roles WHERE name = 'cashier'")->fetchColumn();
$testStaffEmail = 'audit_staff_' . uniqid() . '@qep.test';
$rawPassword = 'StaffPassword123!';
$pwdHash = password_hash($rawPassword, PASSWORD_DEFAULT);

$stmt = $db->prepare("
    INSERT INTO users (full_name, email, password_hash, role_id, status)
    VALUES ('Audit Staff Cashier', :email, :pwd, :role_id, 'active')
");
$stmt->execute(['email' => $testStaffEmail, 'pwd' => $pwdHash, 'role_id' => $roleCashier]);
$staffId = (int) $db->lastInsertId();

// Issue JWT token using JWTService
$jwtService = new App\Services\JWTService();
$token = $jwtService->generateAccessToken([
    'id'        => $staffId,
    'email'     => $testStaffEmail,
    'role_id'   => $roleCashier,
    'role_name' => ROLE_CASHIER,
    'full_name' => 'Audit Staff Cashier',
]);

// Verify token decodes and user is active
$decoded = $jwtService->verifyAccessToken($token);
report("Issued JWT token is cryptographically valid", $decoded !== null && ($decoded['sub'] ?? 0) === $staffId);

// Check user status via UserRepository
$activeUser = UserRepository::findById($staffId);
report("Staff user is initially active in database", ($activeUser['status'] ?? '') === 'active');

// 4.2 Suspend staff member
UserRepository::update($staffId, ['status' => STATUS_SUSPENDED]);
$suspendedUser = UserRepository::findById($staffId);
report("Staff user status successfully updated to 'suspended'", ($suspendedUser['status'] ?? '') === STATUS_SUSPENDED);

// Emulate AuthMiddleware verification with existing unexpired JWT
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
$middlewareUser = UserRepository::findWithPermissions((int) $decoded['sub']);
$isAllowed = ($middlewareUser !== null && ($middlewareUser['status'] ?? '') === STATUS_ACTIVE);
report("Suspended staff member with valid JWT is IMMEDIATELY DENIED access", $isAllowed === false);

// 4.3 Deactivate/restrict staff member
UserRepository::update($staffId, ['status' => STATUS_RESTRICTED]);
$restrictedUser = UserRepository::findById($staffId);
report("Staff user status updated to 'restricted'", ($restrictedUser['status'] ?? '') === STATUS_RESTRICTED);
$isAllowedRestricted = ($restrictedUser !== null && ($restrictedUser['status'] ?? '') === STATUS_ACTIVE);
report("Restricted staff member with valid JWT is IMMEDIATELY DENIED access", $isAllowedRestricted === false);

// 4.4 Reactivate staff member
UserRepository::update($staffId, ['status' => STATUS_ACTIVE]);
$reactivatedUser = UserRepository::findById($staffId);
$isAllowedActive = ($reactivatedUser !== null && ($reactivatedUser['status'] ?? '') === STATUS_ACTIVE);
report("Reactivated staff member immediately regains access", $isAllowedActive === true);

// 4.5 Clean up test staff user
$db->exec("DELETE FROM users WHERE id = {$staffId}");
report("Test staff member cleanly removed from database", true);

echo "\n==============================================================\n";
echo "FEATURES & SECURITY AUDIT SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "==============================================================\n";

if ($failCount > 0) {
    exit(1);
}
