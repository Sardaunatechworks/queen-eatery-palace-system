<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Role & Permission Middleware
 *
 * Role-based and permission-based authorization.
 * Must be called AFTER AuthMiddleware::verify().
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Response;

class RoleMiddleware
{
    /**
     * Require the user to have one of the specified roles.
     * Super Admin and Admin always pass.
     */
    public static function requireRole(string|array ...$roles): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';

        // Super admin and admin bypass role checks
        if ($userRole === ROLE_SUPER_ADMIN || $userRole === ROLE_ADMIN) {
            return;
        }

        $flatRoles = [];
        foreach ($roles as $r) {
            if (is_array($r)) {
                $flatRoles = array_merge($flatRoles, $r);
            } else {
                $flatRoles[] = $r;
            }
        }

        if (!in_array($userRole, $flatRoles, true)) {
            Response::forbidden('Access denied. Required role: ' . implode(' or ', $flatRoles));
        }
    }

    /**
     * Check if a user has a specific permission, resolving camelCase and operational role defaults.
     */
    public static function hasPermission(array $user, string $permission): bool
    {
        $userRole = $user['role_name'] ?? '';
        if ($userRole === ROLE_SUPER_ADMIN || $userRole === ROLE_ADMIN) {
            return true;
        }

        $userPerms = $user['permissions'] ?? [];
        if (!empty($userPerms[$permission])) {
            return true;
        }

        // Check common dot-notation to camelCase aliases
        $aliases = [
            'orders.view'              => ['manageOrders', 'viewOrders'],
            'orders.update_status'     => ['manageOrders'],
            'orders.delete'            => ['manageOrders'],
            'inventory.view'           => ['manageInventory', 'viewInventory'],
            'inventory.adjust'         => ['manageInventory'],
            'inventory.stock_in'       => ['manageInventory'],
            'inventory.wastage'        => ['manageInventory'],
            'menu.view'                => ['manageMenu', 'viewMenu'],
            'menu.create'              => ['manageMenu'],
            'menu.edit'                => ['manageMenu'],
            'menu.delete'              => ['manageMenu'],
            'menu.approve'             => ['manageMenu'],
            'menu.manage_categories'   => ['manageMenu'],
            'staff.view'               => ['manageStaff', 'viewStaff'],
            'staff.create'             => ['manageStaff'],
            'staff.suspend'            => ['manageStaff'],
            'staff.manage_permissions' => ['manageStaff'],
            'staff.delete'             => ['manageStaff'],
            'reports.view'             => ['manageReports', 'viewReports'],
            'reports.export'           => ['manageReports'],
            'transactions.view'        => ['manageReports', 'manageOrders'],
            'notifications.view'       => ['manageNotifications'],
            'cms.manage'               => ['manageCMS'],
        ];

        if (isset($aliases[$permission])) {
            foreach ($aliases[$permission] as $alias) {
                if (!empty($userPerms[$alias])) {
                    return true;
                }
            }
        }

        // Implicit core operational role permissions
        if ($userRole === ROLE_CASHIER) {
            if (in_array($permission, [
                'orders.view', 'orders.create', 'orders.update_status', 
                'manageOrders', 'manageNotifications', 'notifications.view',
                'menu.view', 'inventory.view', 'transactions.view',
                'dashboard.view', 'viewDashboard'
            ], true)) {
                return true;
            }
        }

        if ($userRole === ROLE_KITCHEN) {
            if (in_array($permission, [
                'orders.view', 'orders.update_status', 'orders.cancel', 'manageOrders', 
                'menu.view', 'menu.create', 'menu.edit', 'manageMenu',
                'inventory.view', 'inventory.adjust', 'inventory.stock_in', 'manageInventory',
                'notifications.view'
            ], true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Require the user to have a specific permission.
     * Super Admin and Admin always pass.
     */
    public static function requirePermission(string $permission): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        if (!self::hasPermission($user, $permission)) {
            Response::forbidden('Access denied. Missing required permission.');
        }
    }

    /**
     * Require the user to have ANY of the specified permissions.
     */
    public static function requireAnyPermission(...$permissions): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $flatPerms = [];
        foreach ($permissions as $p) {
            if (is_array($p)) {
                $flatPerms = array_merge($flatPerms, $p);
            } elseif (is_string($p)) {
                $flatPerms[] = $p;
            }
        }

        foreach ($flatPerms as $perm) {
            if (self::hasPermission($user, $perm)) {
                return;
            }
        }

        Response::forbidden('Access denied. Insufficient permissions.');
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

        if ($userId !== $resourceUserId && $userRole !== ROLE_SUPER_ADMIN && $userRole !== ROLE_ADMIN) {
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

        if (($user['role_name'] ?? '') !== ROLE_SUPER_ADMIN) {
            Response::forbidden('Access denied. Super admin privileges required.');
        }
    }

    /**
     * Check if the current user is staff (not a customer).
     */
    public static function requireStaff(): void
    {
        $user = $_REQUEST['auth_user'] ?? null;

        if ($user === null) {
            Response::unauthorized('Authentication required');
        }

        $userRole = $user['role_name'] ?? '';

        if (!in_array($userRole, STAFF_ROLES, true)) {
            Response::forbidden('Access denied. Staff access required.');
        }
    }
}
