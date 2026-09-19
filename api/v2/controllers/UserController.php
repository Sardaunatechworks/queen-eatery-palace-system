<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 User Controller
 *
 * Staff and user management. Thin controller pattern.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\AuditService;
use App\Services\JWTService;
use App\Repositories\UserRepository;
use App\Repositories\PermissionRepository;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class UserController
{
    /**
     * GET /api/v2/users — List all users (admin)
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($_GET['per_page'] ?? DEFAULT_PAGE_SIZE)));
        $role = $_GET['role'] ?? null;
        $status = $_GET['status'] ?? null;
        $search = isset($_GET['search']) ? Sanitizer::clean($_GET['search']) : null;

        $result = UserRepository::list($page, $perPage, $role, $status, $search);

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * GET /api/v2/staff — List staff users only
     */
    public function staff(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.view');

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($_GET['per_page'] ?? DEFAULT_PAGE_SIZE)));
        $search = isset($_GET['search']) ? Sanitizer::clean($_GET['search']) : null;

        $result = UserRepository::listStaff($page, $perPage, $search);

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * GET /api/v2/users/{id}
     */
    public function show(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $user = UserRepository::findWithPermissions($id);

        if (!$user) {
            Response::notFound('User not found');
        }

        // Remove sensitive fields
        unset($user['password_hash']);

        Response::success($user);
    }

    /**
     * POST /api/v2/staff — Create a staff account (admin only)
     */
    public function createStaff(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.create');

        $input = $_REQUEST['json_input'] ?? [];
        if (!isset($input['full_name']) && isset($input['name'])) {
            $input['full_name'] = $input['name'];
        }

        $validator = new Validator();
        $validator->required($input, 'full_name', 'Full name')
                  ->minLength($input, 'full_name', 2, 'Full name')
                  ->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password')
                  ->minLength($input, 'password', 8, 'Password')
                  ->required($input, 'role')
                  ->inArray($input, 'role', [ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $email = Sanitizer::email($input['email']);

        if (UserRepository::emailExists($email)) {
            Response::error('An account with this email already exists', 400);
        }

        // Only super_admin can create admin accounts
        $authUser = $_REQUEST['auth_user'];
        if ($input['role'] === ROLE_ADMIN && $authUser['role_name'] !== ROLE_SUPER_ADMIN) {
            Response::forbidden('Only Super Admin can create admin accounts');
        }

        $roleId = UserRepository::getRoleId($input['role']);
        if (!$roleId) {
            Response::error('Invalid role specified', 400);
        }

        $userId = UserRepository::create([
            'full_name'     => Sanitizer::clean($input['full_name']),
            'email'         => $email,
            'phone'         => isset($input['phone']) ? Sanitizer::phone($input['phone']) : null,
            'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]),
            'role_id'       => $roleId,
            'status'        => STATUS_ACTIVE,
        ]);

        AuditService::staffCreated($userId, $input['full_name'], $input['role']);

        $user = UserRepository::findById($userId);
        unset($user['password_hash']);

        Response::created($user, 'Staff account created successfully');
    }

    /**
     * PUT /api/v2/users/{id}
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $input = $_REQUEST['json_input'] ?? [];

        $user = UserRepository::findById($id);
        if (!$user) {
            Response::notFound('User not found');
        }

        $updateData = [];

        if (isset($input['full_name'])) {
            $updateData['full_name'] = Sanitizer::clean($input['full_name']);
        }
        if (isset($input['phone'])) {
            $updateData['phone'] = Sanitizer::phone($input['phone']);
        }
        if (isset($input['address'])) {
            $updateData['address'] = Sanitizer::clean($input['address']);
        }

        // Email change requires admin or self
        if (isset($input['email'])) {
            $email = Sanitizer::email($input['email']);
            if ($email !== $user['email'] && UserRepository::emailExists($email, $id)) {
                Response::error('Email is already in use', 400);
            }
            $updateData['email'] = $email;
        }

        if (empty($updateData)) {
            Response::error('No valid fields to update', 400);
        }

        UserRepository::update($id, $updateData);

        $updatedUser = UserRepository::findById($id);
        unset($updatedUser['password_hash']);

        Response::success($updatedUser, 'Profile updated successfully');
    }

    /**
     * PATCH /api/v2/users/{id}/status — Update user status (suspend, restrict, reactivate)
     */
    public function updateStatus(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.suspend');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'status')
                  ->inArray($input, 'status', [STATUS_ACTIVE, STATUS_RESTRICTED, STATUS_SUSPENDED]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = UserRepository::findById($id);
        if (!$user) {
            Response::notFound('User not found');
        }

        // Prevent self-suspension
        $authUser = $_REQUEST['auth_user'];
        if ((int) $authUser['id'] === $id) {
            Response::error('You cannot change your own status', 400);
        }

        // Prevent suspending super_admin
        if ($user['role_name'] === ROLE_SUPER_ADMIN) {
            Response::forbidden('Cannot modify Super Admin status');
        }

        $newStatus = $input['status'];
        UserRepository::update($id, ['status' => $newStatus]);

        // Log suspension with reason if provided
        if ($newStatus === STATUS_SUSPENDED || $newStatus === STATUS_RESTRICTED) {
            $reason = Sanitizer::clean($input['reason'] ?? 'No reason provided');
            $endDate = !empty($input['endDate']) ? date('Y-m-d H:i:s', strtotime($input['endDate'])) : null;

            $db = \App\Config\Database::getConnection();
            $stmt = $db->prepare('
                INSERT INTO staff_suspensions (user_id, reason, restriction_type, end_date, created_by)
                VALUES (:uid, :reason, :type, :end, :creator)
            ');
            $stmt->execute([
                'uid'     => $id,
                'reason'  => $reason,
                'type'    => $newStatus,
                'end'     => $endDate,
                'creator' => $authUser['id'] ?? $id,
            ]);

            AuditService::staffSuspended($id, $user['full_name'], $reason);

            // Revoke all tokens on suspension
            (new JWTService())->revokeAllTokensForUser($id);
        } else {
            $db = \App\Config\Database::getConnection();
            $db->prepare('DELETE FROM staff_suspensions WHERE user_id = :uid')->execute(['uid' => $id]);

            AuditService::staffReactivated($id, $user['full_name']);
        }

        Response::success(null, "User status updated to {$newStatus}");
    }

    /**
     * PUT /api/v2/users/{id}/password
     */
    public function changePassword(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireSelfOrAdmin($id);

        $input = $_REQUEST['json_input'] ?? [];
        $authUser = $_REQUEST['auth_user'];
        $isSelf = (int) $authUser['id'] === $id;

        $validator = new Validator();
        $validator->required($input, 'new_password', 'New password')
                  ->minLength($input, 'new_password', 8, 'New password');

        // Require current password only for self-change
        if ($isSelf) {
            $validator->required($input, 'current_password', 'Current password');
        }

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = UserRepository::findByEmail(UserRepository::findById($id)['email'] ?? '');
        if (!$user) {
            Response::notFound('User not found');
        }

        // Verify current password for self-change
        if ($isSelf && !password_verify($input['current_password'], $user['password_hash'])) {
            Response::error('Current password is incorrect', 400);
        }

        $hash = password_hash($input['new_password'], PASSWORD_BCRYPT, ['cost' => 12]);
        UserRepository::updatePassword($id, $hash);

        // Revoke all refresh tokens
        (new JWTService())->revokeAllTokensForUser($id);

        AuditService::passwordReset($id);

        Response::success(null, 'Password changed successfully');
    }

    /**
     * PUT /api/v2/users/{id}/permissions
     */
    public function updatePermissions(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.manage_permissions');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'permissions')
                  ->isArray($input, 'permissions');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = UserRepository::findById($id);
        if (!$user) {
            Response::notFound('User not found');
        }

        // Cannot modify super_admin permissions
        if ($user['role_name'] === ROLE_SUPER_ADMIN) {
            Response::forbidden('Cannot modify Super Admin permissions');
        }

        PermissionRepository::updateUserPermissions($id, $input['permissions']);

        AuditService::permissionsUpdated($id, $user['full_name']);

        $effectivePerms = PermissionRepository::getEffectivePermissions($id, (int) $user['role_id']);

        Response::success(['permissions' => $effectivePerms], 'Permissions updated successfully');
    }

    /**
     * GET /api/v2/permissions — List all permissions grouped
     */
    public function listPermissions(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.manage_permissions');

        $grouped = PermissionRepository::getAllGrouped();

        Response::success($grouped);
    }

    /**
     * GET /api/v2/roles — List all roles
     */
    public function listRoles(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireStaff();

        $roles = UserRepository::getAllRoles();

        Response::success($roles);
    }

    /**
     * DELETE /api/v2/users/{id} — Soft delete
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('staff.delete');

        $user = UserRepository::findById($id);
        if (!$user) {
            Response::notFound('User not found');
        }

        $authUser = $_REQUEST['auth_user'];
        if ((int) $authUser['id'] === $id) {
            Response::error('You cannot delete your own account', 400);
        }

        if ($user['role_name'] === ROLE_SUPER_ADMIN) {
            Response::forbidden('Cannot delete Super Admin');
        }

        UserRepository::softDelete($id);
        (new JWTService())->revokeAllTokensForUser($id);

        AuditService::log('user.deleted', 'user', (string) $id, "User deleted: {$user['full_name']}");

        Response::success(null, 'User deleted successfully');
    }
}
