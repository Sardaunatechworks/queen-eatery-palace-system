<?php
/**
 * Queen Eatery Palace - Authentication Controller
 * 
 * Handles user login, registration, token refresh, and logout.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\JWTService;
use App\Services\MailService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;

class AuthController
{
    private JWTService $jwtService;

    public function __construct()
    {
        $this->jwtService = new JWTService();
    }

    /**
     * User Login (unified for all roles)
     * POST /api/auth/login
     */
    public function login(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $email = Sanitizer::email($input['email']);
        $password = $input['password'];

        $db = Database::getConnection();
        
        // Fetch user with role name
        $stmt = $db->prepare('
            SELECT u.*, r.name AS role_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = :email
            LIMIT 1
        ');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid email or password', 401);
        }

        // Check account status
        if ($user['status'] === STATUS_SUSPENDED) {
            // Check if suspension has an end date
            $suspStmt = $db->prepare('
                SELECT reason, end_date FROM staff_suspensions
                WHERE user_id = :uid
                ORDER BY created_at DESC LIMIT 1
            ');
            $suspStmt->execute(['uid' => $user['id']]);
            $suspension = $suspStmt->fetch();

            $reason = $suspension ? $suspension['reason'] : 'No reason specified';
            $endDate = $suspension && $suspension['end_date'] ? new \DateTime($suspension['end_date']) : null;

            if ($endDate && $endDate < new \DateTime()) {
                // Suspension expired, automatically reactivate user
                $reactStmt = $db->prepare('UPDATE users SET status = "active" WHERE id = :uid');
                $reactStmt->execute(['uid' => $user['id']]);
                $user['status'] = STATUS_ACTIVE;
                AuditService::userStatusChanged((int)$user['id'], STATUS_SUSPENDED, STATUS_ACTIVE);
            } else {
                $dateStr = $endDate ? $endDate->format('d/M/Y h:i A') : 'indefinitely';
                Response::forbidden("Access Denied: Your account is suspended until {$dateStr}. Reason: {$reason}");
            }
        }

        if ($user['status'] !== STATUS_ACTIVE) {
            Response::forbidden("Access Denied: Your account is " . $user['status'] . ". Contact an administrator.");
        }

        // Load permissions
        $permissions = $this->loadPermissions((int)$user['id'], (int)$user['role_id']);

        // Generate tokens
        $accessToken = $this->jwtService->generateAccessToken($user);
        $refreshToken = $this->jwtService->generateRefreshToken((int)$user['id']);

        // Log audit
        AuditService::userLogin((int)$user['id'], $email);

        Response::success([
            'accessToken'  => $accessToken,
            'refreshToken' => $refreshToken,
            'profile'      => [
                'uid'          => (string) $user['id'],
                'name'         => $user['full_name'],
                'email'        => $user['email'],
                'phone'        => $user['phone'] ?? '',
                'address'      => $user['address'] ?? '',
                'role'         => $user['role_name'],
                'isSuperAdmin' => (bool) $user['is_super_admin'],
                'permissions'  => $permissions,
                'photoURL'     => $user['profile_image'] ?? '',
            ]
        ], 'Login successful');
    }

    /**
     * Customer Self-Signup
     * POST /api/auth/signup
     */
    public function signup(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2)
                  ->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'phone')
                  ->phone($input, 'phone')
                  ->required($input, 'address')
                  ->minLength($input, 'address', 5)
                  ->required($input, 'password')
                  ->minLength($input, 'password', 6);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $email = Sanitizer::email($input['email']);
        
        // Prevent registration with admin/staff emails
        if ($email === 'admin@queenspalaceeatery.com') {
            Response::error('This email cannot be registered publicly.', 400);
        }

        $db = Database::getConnection();

        // Check if email already exists
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        if ($stmt->fetch()) {
            Response::error('An account with this email already exists', 400);
        }

        // Get customer role ID
        $stmt = $db->prepare('SELECT id FROM roles WHERE name = "customer" LIMIT 1');
        $stmt->execute();
        $roleRow = $stmt->fetch();
        if (!$roleRow) {
            Response::error('Customer role configuration missing', 500);
        }
        $customerRoleId = (int) $roleRow['id'];

        $passwordHash = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->beginTransaction();
        try {
            // Insert user
            $stmt = $db->prepare('
                INSERT INTO users (full_name, email, phone, address, password_hash, role_id, status, is_super_admin)
                VALUES (:name, :email, :phone, :address, :hash, :role_id, :status, 0)
            ');
            $stmt->execute([
                'name'    => Sanitizer::clean($input['name']),
                'email'   => $email,
                'phone'   => Sanitizer::clean($input['phone']),
                'address' => Sanitizer::clean($input['address']),
                'hash'    => $passwordHash,
                'role_id' => $customerRoleId,
                'status'  => STATUS_ACTIVE, // Customer active immediately by default
            ]);

            $userId = (int) $db->lastInsertId();

            $db->commit();

            // Log audit
            AuditService::userCreated($userId, $email, ROLE_CUSTOMER);

            // Send Welcome Email
            $mailService = new MailService();
            $mailService->sendWelcome($email, $input['name']);

            Response::created([
                'uid'   => (string) $userId,
                'email' => $email,
            ], 'Account created successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Refresh Access Token
     * POST /api/auth/refresh
     */
    public function refresh(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $refreshToken = $input['refreshToken'] ?? '';

        if (empty($refreshToken)) {
            Response::error('Refresh token is required', 400);
        }

        $userId = $this->jwtService->verifyRefreshToken($refreshToken);

        if ($userId === null) {
            Response::unauthorized('Invalid or expired refresh token');
        }

        $db = Database::getConnection();
        
        // Fetch user details
        $stmt = $db->prepare('
            SELECT u.*, r.name AS role_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== STATUS_ACTIVE) {
            Response::unauthorized('User account is restricted or suspended');
        }

        // Load permissions
        $permissions = $this->loadPermissions($userId, (int)$user['role_id']);

        // Generate new access token
        $newAccessToken = $this->jwtService->generateAccessToken($user);

        Response::success([
            'accessToken' => $newAccessToken,
            'profile'      => [
                'uid'          => (string) $user['id'],
                'name'         => $user['full_name'],
                'email'        => $user['email'],
                'phone'        => $user['phone'] ?? '',
                'address'      => $user['address'] ?? '',
                'role'         => $user['role_name'],
                'isSuperAdmin' => (bool) $user['is_super_admin'],
                'permissions'  => $permissions,
                'photoURL'     => $user['profile_image'] ?? '',
            ]
        ], 'Token refreshed successfully');
    }

    /**
     * User Logout
     * POST /api/auth/logout
     */
    public function logout(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $refreshToken = $input['refreshToken'] ?? '';

        if (!empty($refreshToken)) {
            $this->jwtService->revokeRefreshToken($refreshToken);
        }

        // Audit log if authenticated
        $user = $_REQUEST['auth_user'] ?? null;
        if ($user) {
            AuditService::userLogout((int)$user['id']);
        }

        Response::success(null, 'Logged out successfully');
    }

    /**
     * Request Password Reset Email
     * POST /api/auth/forgot-password
     */
    public function forgotPassword(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'email')->email($input, 'email');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $email = Sanitizer::email($input['email']);

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT id, full_name FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        // Always return success to prevent user enumeration
        if (!$user) {
            Response::success(null, 'If the email exists, a password reset link has been sent.');
        }

        // Generate a secure reset token
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + 3600); // 1 hour

        // Invalidate old unused reset tokens for this email
        $stmt = $db->prepare('UPDATE password_resets SET used = 1 WHERE email = :email');
        $stmt->execute(['email' => $email]);

        // Insert new reset token
        $stmt = $db->prepare('
            INSERT INTO password_resets (email, token_hash, expires_at)
            VALUES (:email, :hash, :expires)
        ');
        $stmt->execute([
            'email'   => $email,
            'hash'    => $tokenHash,
            'expires' => $expiresAt
        ]);

        // Log audit
        AuditService::passwordReset($email);

        // Send reset email
        $mailService = new MailService();
        $mailService->sendPasswordReset($email, $user['full_name'], $token);

        Response::success(null, 'If the email exists, a password reset link has been sent.');
    }

    /**
     * Reset Password using Token
     * POST /api/auth/reset-password
     */
    public function resetPassword(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'token')
                  ->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password')
                  ->minLength($input, 'password', 6);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $email = Sanitizer::email($input['email']);
        $tokenHash = hash('sha256', $input['token']);

        $db = Database::getConnection();

        // Validate token
        $stmt = $db->prepare('
            SELECT id FROM password_resets
            WHERE email = :email AND token_hash = :hash AND expires_at > NOW() AND used = 0
            LIMIT 1
        ');
        $stmt->execute([
            'email' => $email,
            'hash'  => $tokenHash
        ]);

        if (!$stmt->fetch()) {
            Response::error('Invalid or expired reset token', 400);
        }

        $passwordHash = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->beginTransaction();
        try {
            // Update user password
            $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE email = :email');
            $stmt->execute([
                'hash'  => $passwordHash,
                'email' => $email
            ]);

            // Mark token as used
            $stmt = $db->prepare('UPDATE password_resets SET used = 1 WHERE email = :email AND token_hash = :hash');
            $stmt->execute([
                'email' => $email,
                'hash'  => $tokenHash
            ]);

            // Fetch user to revoke all refresh tokens (force relogin everywhere)
            $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch();
            if ($user) {
                $this->jwtService->revokeAllTokensForUser((int)$user['id']);
                AuditService::passwordChanged((int)$user['id']);
            }

            $db->commit();
            Response::success(null, 'Password has been reset successfully.');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Get Current Authenticated User profile
     * GET /api/auth/me
     */
    public function me(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'] ?? null;

        if (!$user) {
            Response::unauthorized();
        }

        Response::success([
            'profile' => [
                'uid'          => (string) $user['id'],
                'name'         => $user['full_name'],
                'email'        => $user['email'],
                'phone'        => $user['phone'] ?? '',
                'address'      => $user['address'] ?? '',
                'role'         => $user['role_name'],
                'isSuperAdmin' => (bool) $user['is_super_admin'],
                'permissions'  => $user['permissions'] ?? [],
                'photoURL'     => $user['profile_image'] ?? '',
            ]
        ]);
    }

    /**
     * Helper to load effective permissions
     */
    private function loadPermissions(int $userId, int $roleId): array
    {
        $db = Database::getConnection();

        // Get all permission names
        $stmt = $db->prepare('SELECT id, name FROM permissions');
        $stmt->execute();
        $allPermissions = $stmt->fetchAll();

        // Get role-level permissions
        $stmt = $db->prepare('SELECT permission_id FROM role_permissions WHERE role_id = :rid');
        $stmt->execute(['rid' => $roleId]);
        $rolePermIds = array_column($stmt->fetchAll(), 'permission_id');

        // Get per-user overrides
        $stmt = $db->prepare('SELECT permission_id, granted FROM user_permissions WHERE user_id = :uid');
        $stmt->execute(['uid' => $userId]);
        $userOverrides = [];
        foreach ($stmt->fetchAll() as $row) {
            $userOverrides[(int) $row['permission_id']] = (bool) $row['granted'];
        }

        $permissions = [];
        foreach ($allPermissions as $perm) {
            $permId = (int) $perm['id'];
            $permName = $perm['name'];

            if (isset($userOverrides[$permId])) {
                $permissions[$permName] = $userOverrides[$permId];
            } else {
                $permissions[$permName] = in_array($permId, $rolePermIds);
            }
        }

        return $permissions;
    }
}
