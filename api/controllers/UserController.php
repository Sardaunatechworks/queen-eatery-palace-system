<?php
/**
 * Queen Eatery Palace - User & Staff Controller
 * 
 * Handles staff creation, suspensions, permissions, user listing,
 * profile updates, and profile photo uploads.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\FileUploadService;
use App\Services\AuditService;
use App\Services\JWTService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class UserController
{
    /**
     * List all users
     * GET /api/users
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('manageStaff', 'viewDashboard');

        $db = Database::getConnection();
        
        // Fetch all users (excluding deleted or optionally returning them)
        $stmt = $db->query('
            SELECT u.id, u.full_name, u.email, u.phone, u.address,
                   u.role_id, u.status, u.is_super_admin, u.profile_image,
                   u.created_at, u.updated_at,
                   r.name AS role_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            ORDER BY u.created_at DESC
        ');
        $users = $stmt->fetchAll();

        // Load permissions for each user for display
        foreach ($users as &$user) {
            $user['name'] = $user['full_name'];
            $user['role'] = $user['role_name'];
            $user['permissions'] = $this->loadPermissions((int)$user['id'], (int)$user['role_id']);
            $user['uid'] = (string)$user['id']; // compatibility with client
        }

        Response::success($users);
    }

    /**
     * Get single user profile
     * GET /api/users/{id}
     */
    public function show(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT u.id, u.full_name, u.email, u.phone, u.address,
                   u.role_id, u.status, u.is_super_admin, u.profile_image,
                   u.created_at, u.updated_at,
                   r.name AS role_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::notFound('User not found');
        }

        $user['uid'] = (string)$user['id'];
        $user['name'] = $user['full_name'];
        $user['role'] = $user['role_name'];
        $user['permissions'] = $this->loadPermissions($id, (int)$user['role_id']);

        Response::success($user);
    }

    /**
     * Admin create staff account
     * POST /api/users/create-staff
     */
    public function createStaff(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageStaff');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2)
                  ->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password')
                  ->minLength($input, 'password', 6)
                  ->required($input, 'role')
                  ->inArray($input, 'role', [ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN, ROLE_CUSTOMER]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $email = Sanitizer::email($input['email']);
        $db = Database::getConnection();

        // Check if email already exists
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        if ($stmt->fetch()) {
            Response::error('An account with this email already exists', 400);
        }

        // Get Role ID
        $stmt = $db->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $stmt->execute(['name' => $input['role']]);
        $roleRow = $stmt->fetch();
        if (!$roleRow) {
            Response::error('Role configuration missing', 500);
        }
        $roleId = (int) $roleRow['id'];

        $passwordHash = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->beginTransaction();
        try {
            // Create user
            $stmt = $db->prepare('
                INSERT INTO users (full_name, email, phone, address, password_hash, role_id, status, is_super_admin)
                VALUES (:name, :email, :phone, :address, :hash, :role_id, :status, 0)
            ');
            $stmt->execute([
                'name'    => Sanitizer::clean($input['name']),
                'email'   => $email,
                'phone'   => Sanitizer::clean($input['phone'] ?? ''),
                'address' => Sanitizer::clean($input['address'] ?? ''),
                'hash'    => $passwordHash,
                'role_id' => $roleId,
                'status'  => STATUS_ACTIVE,
            ]);

            $newUserId = (int) $db->lastInsertId();

            // Setup default permissions overrides for granular customization
            $permissions = [
                'manageInventory'     => $input['role'] === ROLE_ADMIN,
                'manageOrders'        => $input['role'] === ROLE_ADMIN || $input['role'] === ROLE_CASHIER || $input['role'] === ROLE_KITCHEN,
                'manageMenu'          => $input['role'] === ROLE_ADMIN,
                'manageReports'       => $input['role'] === ROLE_ADMIN,
                'manageCMS'           => $input['role'] === ROLE_ADMIN,
                'manageNotifications' => $input['role'] === ROLE_ADMIN || $input['role'] === ROLE_CASHIER,
                'manageStaff'         => $input['role'] === ROLE_ADMIN,
                'viewDashboard'       => $input['role'] === ROLE_ADMIN,
            ];

            // Fetch permission IDs
            $stmt = $db->query('SELECT id, name FROM permissions');
            $allPerms = $stmt->fetchAll();
            $permMap = array_column($allPerms, 'id', 'name');

            $permStmt = $db->prepare('
                INSERT INTO user_permissions (user_id, permission_id, granted)
                VALUES (:uid, :pid, :granted)
            ');

            foreach ($permissions as $name => $granted) {
                if (isset($permMap[$name])) {
                    $permStmt->execute([
                        'uid'     => $newUserId,
                        'pid'     => $permMap[$name],
                        'granted' => $granted ? 1 : 0
                    ]);
                }
            }

            $db->commit();

            // Log Audit
            AuditService::userCreated($newUserId, $email, $input['role']);

            Response::created([
                'uid'  => (string) $newUserId,
                'role' => $input['role'],
            ], 'User account created successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update user profile information
     * PUT /api/users/{id}
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2)
                  ->required($input, 'email')
                  ->email($input, 'email');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $email = Sanitizer::email($input['email']);
        $db = Database::getConnection();

        // Verify email uniqueness (excluding self)
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email AND id != :id LIMIT 1');
        $stmt->execute(['email' => $email, 'id' => $id]);
        if ($stmt->fetch()) {
            Response::error('Email already in use by another user', 400);
        }

        // Fetch original user to detect changes for audit
        $stmt = $db->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $orig = $stmt->fetch();
        if (!$orig) {
            Response::notFound('User not found');
        }

        $isAdmin = $_REQUEST['auth_user']['role_name'] === ROLE_ADMIN || $_REQUEST['auth_user']['is_super_admin'];
        $roleId = (int)$orig['role_id'];

        if ($isAdmin && isset($input['role'])) {
            $stmt = $db->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
            $stmt->execute(['name' => $input['role']]);
            $roleRow = $stmt->fetch();
            if ($roleRow) {
                $roleId = (int)$roleRow['id'];
            }
        }

        // Perform update
        $stmt = $db->prepare('
            UPDATE users
            SET full_name = :name, email = :email, phone = :phone, address = :address, role_id = :role_id
            WHERE id = :id
        ');
        $stmt->execute([
            'name'    => Sanitizer::clean($input['name']),
            'email'   => $email,
            'phone'   => Sanitizer::clean($input['phone'] ?? ''),
            'address' => Sanitizer::clean($input['address'] ?? ''),
            'role_id' => $roleId,
            'id'      => $id
        ]);

        // Audit logs for changes
        if ($orig['full_name'] !== $input['name']) AuditService::userUpdated($id, 'full_name');
        if ($orig['email'] !== $email) AuditService::userUpdated($id, 'email');
        if ($orig['phone'] !== ($input['phone'] ?? '')) AuditService::userUpdated($id, 'phone');
        if ($orig['address'] !== ($input['address'] ?? '')) AuditService::userUpdated($id, 'address');

        Response::success(null, 'Profile updated successfully');
    }

    /**
     * Restrict or suspend staff account
     * PATCH /api/users/{id}/status
     */
    public function updateStatus(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageStaff');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'status')
                  ->inArray($input, 'status', [STATUS_ACTIVE, STATUS_RESTRICTED, STATUS_SUSPENDED, STATUS_DELETED]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $db = Database::getConnection();

        // Fetch target user details
        $stmt = $db->prepare('SELECT id, email, status, is_super_admin FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $target = $stmt->fetch();

        if (!$target) {
            Response::notFound('User not found');
        }

        // Prevent suspending/deleting super admin accounts
        if ($target['is_super_admin'] && $input['status'] !== STATUS_ACTIVE) {
            Response::error('Super admin accounts cannot be suspended, restricted, or deleted.', 400);
        }

        $db->beginTransaction();
        try {
            // Update status
            $stmt = $db->prepare('UPDATE users SET status = :status WHERE id = :id');
            $stmt->execute(['status' => $input['status'], 'id' => $id]);

            // Save suspension details if suspended/restricted
            if ($input['status'] === STATUS_SUSPENDED || $input['status'] === STATUS_RESTRICTED) {
                $reason = Sanitizer::clean($input['reason'] ?? 'No reason provided');
                $endDate = !empty($input['endDate']) ? date('Y-m-d H:i:s', strtotime($input['endDate'])) : null;

                $stmt = $db->prepare('
                    INSERT INTO staff_suspensions (user_id, reason, restriction_type, end_date, created_by)
                    VALUES (:uid, :reason, :type, :end, :creator)
                ');
                $stmt->execute([
                    'uid'     => $id,
                    'reason'  => $reason,
                    'type'    => $input['status'],
                    'end'     => $endDate,
                    'creator' => $_REQUEST['auth_user']['id']
                ]);
            }

            // Revoke refresh tokens on suspension/restriction/deletion to immediately terminate active sessions
            if ($input['status'] !== STATUS_ACTIVE) {
                $jwt = new JWTService();
                $jwt->revokeAllTokensForUser($id);
            }

            $db->commit();

            // Log Audit
            AuditService::userStatusChanged($id, $target['status'], $input['status']);

            Response::success(null, "User status updated to {$input['status']}");

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Delete user
     * DELETE /api/users/{id}
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageStaff');

        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT id, email, is_super_admin FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::notFound('User not found');
        }

        if ($user['is_super_admin']) {
            Response::error('Super admin accounts cannot be deleted.', 400);
        }

        $db->beginTransaction();
        try {
            // Delete user overrides
            $stmt = $db->prepare('DELETE FROM user_permissions WHERE user_id = :uid');
            $stmt->execute(['uid' => $id]);

            // Delete user refresh tokens
            $stmt = $db->prepare('DELETE FROM refresh_tokens WHERE user_id = :uid');
            $stmt->execute(['uid' => $id]);

            // Hard delete user from users table
            $stmt = $db->prepare('DELETE FROM users WHERE id = :id');
            $stmt->execute(['id' => $id]);

            $db->commit();

            // Log Audit
            AuditService::userDeleted($id, $user['email']);

            Response::success(null, 'User account deleted successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Change user password
     * PUT /api/users/{id}/password
     */
    public function changePassword(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'newPassword')
                  ->minLength($input, 'newPassword', 6);

        // Require current password for self-service updates
        $isSelf = (int)$_REQUEST['auth_user']['id'] === $id;
        if ($isSelf) {
            $validator->required($input, 'currentPassword');
        }

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $db = Database::getConnection();

        // Get current user details
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::notFound('User not found');
        }

        // Verify current password for self-update
        if ($isSelf && !password_verify($input['currentPassword'], $user['password_hash'])) {
            Response::error('Current password is incorrect', 400);
        }

        $newHash = password_hash($input['newPassword'], PASSWORD_BCRYPT, ['cost' => 12]);

        $db->beginTransaction();
        try {
            $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
            $stmt->execute(['hash' => $newHash, 'id' => $id]);

            // Invalidate all active tokens (force relogin)
            $jwt = new JWTService();
            $jwt->revokeAllTokensForUser($id);

            $db->commit();

            // Log Audit
            AuditService::passwordChanged($id);

            Response::success(null, 'Password updated successfully. Please login again.');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update user overrides permissions
     * PUT /api/users/{id}/permissions
     */
    public function updatePermissions(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSuperAdmin(); // Restrict to Super Admin / top role

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'permissions')->isArray($input, 'permissions');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $db = Database::getConnection();

        // Fetch user status
        $stmt = $db->prepare('SELECT id, role_id FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::notFound('User not found');
        }

        // Fetch permission mapping
        $stmt = $db->query('SELECT id, name FROM permissions');
        $allPerms = $stmt->fetchAll();
        $permMap = array_column($allPerms, 'id', 'name');

        $db->beginTransaction();
        try {
            // Delete existing overrides
            $stmt = $db->prepare('DELETE FROM user_permissions WHERE user_id = :uid');
            $stmt->execute(['uid' => $id]);

            $insStmt = $db->prepare('
                INSERT INTO user_permissions (user_id, permission_id, granted)
                VALUES (:uid, :pid, :granted)
            ');

            foreach ($input['permissions'] as $name => $granted) {
                if (isset($permMap[$name])) {
                    $insStmt->execute([
                        'uid'     => $id,
                        'pid'     => $permMap[$name],
                        'granted' => $granted ? 1 : 0
                    ]);

                    AuditService::permissionChanged($id, $name, (bool)$granted);
                }
            }

            $db->commit();
            Response::success(null, 'User permissions updated successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Upload User Profile Image
     * POST /api/users/{id}/profile-image
     */
    public function uploadProfileImage(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        if (empty($_FILES['image'])) {
            Response::error('No image file uploaded', 400);
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT profile_image FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::notFound('User not found');
        }

        $uploadService = new FileUploadService();
        $result = $uploadService->upload($_FILES['image'], 'profile');

        if (!$result['success']) {
            Response::error($result['error'], 400);
        }

        $db->beginTransaction();
        try {
            // Update database path
            $stmt = $db->prepare('UPDATE users SET profile_image = :path WHERE id = :id');
            $stmt->execute(['path' => $result['url'], 'id' => $id]);

            // Delete old file if exists
            if (!empty($user['profile_image'])) {
                // Extract relative path from URL (assuming '/uploads/' prefix)
                $oldPath = str_replace('/uploads/', '', $user['profile_image']);
                $uploadService->delete($oldPath);
            }

            $db->commit();

            AuditService::userUpdated($id, 'profile_image');

            Response::success([
                'url' => $result['url']
            ], 'Profile image uploaded successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            // Delete newly uploaded file if DB update failed
            $uploadService->delete($result['path']);
            throw $e;
        }
    }

    /**
     * Helper to load permissions mapping
     */
    private function loadPermissions(int $userId, int $roleId): array
    {
        $db = Database::getConnection();

        // Get all permission names
        $stmt = $db->prepare('SELECT id, name FROM permissions');
        $stmt->execute();
        $allPermissions = $stmt->fetchAll();

        // Get role permissions
        $stmt = $db->prepare('SELECT permission_id FROM role_permissions WHERE role_id = :rid');
        $stmt->execute(['rid' => $roleId]);
        $rolePermIds = array_column($stmt->fetchAll(), 'permission_id');

        // Get overrides
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
