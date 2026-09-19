<?php
/**
 * Queen Eatery Palace - Role & Permission Middleware
 * 
 * Checks role-based and permission-based authorization.
 * Must be called AFTER AuthMiddleware::verify().
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Response;

class RoleMiddleware
{
    /**
     * Require the user to have one of the specified roles.
     * Admin always passes.
     */
    public static function requireRole(string ...$roles): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';

        // Super admin and admin bypass role checks
        if ($userRole === ROLE_ADMIN || $user['is_super_admin']) {
            return;
        }

        if (!in_array($userRole, $roles, true)) {
            Response::forbidden("Access denied. Required role: " . implode(' or ', $roles));
        }
    }

    /**
     * Require the user to have a specific permission.
     * Admin always passes.
     */
    public static function requirePermission(string $permission): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';

        // Admin bypasses permission checks
        if ($userRole === ROLE_ADMIN || $user['is_super_admin']) {
            return;
        }

        $permissions = $user['permissions'] ?? [];

        if (empty($permissions[$permission])) {
            Response::forbidden("Access denied. Missing permission: {$permission}");
        }
    }

    /**
     * Require the user to have ANY of the specified permissions.
     * Admin always passes.
     */
    public static function requireAnyPermission(...$permissions): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';

        // Admin bypasses permission checks
        if ($userRole === ROLE_ADMIN || $user['is_super_admin']) {
            return;
        }

        $userPerms = $user['permissions'] ?? [];

        $flatPerms = [];
        foreach ($permissions as $p) {
            if (is_array($p)) {
                $flatPerms = array_merge($flatPerms, $p);
            } elseif (is_string($p)) {
                $flatPerms[] = $p;
            }
        }

        foreach ($flatPerms as $perm) {
            if (!empty($userPerms[$perm])) {
                return; // Has at least one required permission
            }
        }

        Response::forbidden("Access denied. Requires one of: " . implode(', ', $flatPerms));
    }

    /**
     * Require the user to be accessing their own resource, or be an admin.
     */
    public static function requireSelfOrAdmin(int $resourceUserId): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';
        $userId = (int) $user['id'];

        if ($userId !== $resourceUserId && $userRole !== ROLE_ADMIN && !$user['is_super_admin']) {
            Response::forbidden('Access denied. You can only access your own resources.');
        }
    }

    /**
     * Require the user to be a super admin.
     */
    public static function requireSuperAdmin(): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        if (!($user['is_super_admin'] ?? false)) {
            Response::forbidden('Access denied. Super admin privileges required.');
        }
    }
}
