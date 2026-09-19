<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Permission Repository
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;

class PermissionRepository
{
    /**
     * Map high-level module permissions to their granular dot-notation permissions.
     */
    private const MODULE_TO_GRANULAR = [
        'manageOrders' => [
            'orders.view', 'orders.create', 'orders.update_status', 'orders.cancel', 'orders.delete',
        ],
        'manageInventory' => [
            'inventory.view', 'inventory.adjust', 'inventory.stock_in',
        ],
        'manageMenu' => [
            'menu.view', 'menu.create', 'menu.edit', 'menu.delete', 'menu.approve', 'menu.manage_categories',
        ],
        'manageReports' => [
            'reports.view', 'reports.export', 'transactions.view', 'transactions.export',
        ],
        'manageCMS' => [
            'cms.view', 'cms.edit', 'event_hall.view_inquiries', 'event_hall.manage_inquiries',
        ],
        'manageNotifications' => [
            'notifications.view', 'notifications.manage',
        ],
        'manageStaff' => [
            'staff.view', 'staff.create', 'staff.edit', 'staff.suspend', 'staff.delete', 'staff.reset_password', 'staff.manage_permissions',
        ],
        'viewDashboard' => [
            'audit.view', 'reports.view', 'orders.view',
        ],
    ];

    /**
     * Ensure high-level module permissions exist in the permissions table.
     */
    public static function ensureModulePermissionsExist(): void
    {
        try {
            $db = Database::getConnection();
            $modules = [
                ['manageInventory', 'inventory', 'Manage Inventory', 'Manage inventory stock levels'],
                ['manageOrders', 'orders', 'Manage Orders', 'View and manage orders'],
                ['manageMenu', 'menu', 'Manage Menu', 'Create, edit, delete menu items'],
                ['manageReports', 'reports', 'Manage Reports', 'Generate and view reports'],
                ['manageCMS', 'cms', 'Manage CMS', 'Edit CMS and event inquiries'],
                ['manageNotifications', 'notifications', 'Manage Notifications', 'Manage notification system'],
                ['manageStaff', 'staff', 'Manage Staff', 'Create, suspend, delete staff accounts'],
                ['viewDashboard', 'dashboard', 'View Dashboard', 'Access admin dashboard overview'],
            ];

            $stmt = $db->prepare('
                INSERT IGNORE INTO permissions (name, group_name, display_name, description)
                VALUES (:name, :group, :display, :desc)
            ');

            foreach ($modules as [$name, $group, $display, $desc]) {
                $stmt->execute([
                    'name'    => $name,
                    'group'   => $group,
                    'display' => $display,
                    'desc'    => $desc,
                ]);
            }
        } catch (\Throwable) {
            // Non-blocking in case schema is read-only or already contains keys
        }
    }

    /**
     * Get effective permissions for a user (role defaults + per-user overrides).
     */
    public static function getEffectivePermissions(int $userId, int $roleId): array
    {
        self::ensureModulePermissionsExist();
        $db = Database::getConnection();

        // Get all permission names
        $allPerms = $db->query('SELECT id, name FROM permissions')->fetchAll();

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

        // Build base permissions map
        $permissions = [];
        $permNameToId = [];
        foreach ($allPerms as $perm) {
            $permId = (int) $perm['id'];
            $permName = $perm['name'];
            $permNameToId[$permName] = $permId;

            if (isset($userOverrides[$permId])) {
                $permissions[$permName] = $userOverrides[$permId];
            } else {
                $permissions[$permName] = in_array($permId, $rolePermIds, true);
            }
        }

        // Synthesize high-level convenience permissions, honoring explicit user overrides if present
        foreach (self::MODULE_TO_GRANULAR as $moduleKey => $granularKeys) {
            // Check if there is an explicit user override on the module key itself
            if (isset($permNameToId[$moduleKey]) && isset($userOverrides[$permNameToId[$moduleKey]])) {
                $permissions[$moduleKey] = $userOverrides[$permNameToId[$moduleKey]];
                continue;
            }

            // Otherwise, derive from granular permissions: true if ANY granular permission is true
            $hasAnyGranular = false;
            foreach ($granularKeys as $gKey) {
                if (!empty($permissions[$gKey])) {
                    $hasAnyGranular = true;
                    break;
                }
            }

            // If the moduleKey was already in role_permissions or base permissions, retain or elevate
            $permissions[$moduleKey] = !empty($permissions[$moduleKey]) || $hasAnyGranular;
        }

        return $permissions;
    }

    /**
     * Get all permissions grouped by group_name.
     */
    public static function getAllGrouped(): array
    {
        $db = Database::getConnection();
        $perms = $db->query('SELECT id, name, group_name, display_name, description FROM permissions ORDER BY group_name, id')->fetchAll();

        $grouped = [];
        foreach ($perms as $perm) {
            $group = $perm['group_name'];
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = $perm;
        }

        return $grouped;
    }

    /**
     * Get permissions for a specific role.
     */
    public static function getRolePermissions(int $roleId): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT p.id, p.name, p.group_name, p.display_name
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role_id = :rid
            ORDER BY p.group_name, p.id
        ');
        $stmt->execute(['rid' => $roleId]);
        return $stmt->fetchAll();
    }

    /**
     * Get per-user permission overrides.
     */
    public static function getUserOverrides(int $userId): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT up.permission_id, up.granted, p.name AS permission_name
            FROM user_permissions up
            JOIN permissions p ON up.permission_id = p.id
            WHERE up.user_id = :uid
        ');
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll();
    }

    /**
     * Update per-user permission overrides.
     * $permissions = ['permission_name' => true/false, ...]
     */
    public static function updateUserPermissions(int $userId, array $permissions): void
    {
        self::ensureModulePermissionsExist();
        $db = Database::getConnection();

        // Clear existing overrides
        $stmt = $db->prepare('DELETE FROM user_permissions WHERE user_id = :uid');
        $stmt->execute(['uid' => $userId]);

        // Get permission name → id map
        $allPerms = $db->query('SELECT id, name FROM permissions')->fetchAll();
        $permMap = [];
        foreach ($allPerms as $p) {
            $permMap[$p['name']] = (int) $p['id'];
        }

        // Expand incoming permissions to both module keys and granular keys
        $resolvedOverrides = [];
        foreach ($permissions as $permName => $granted) {
            $boolGranted = (bool) $granted;
            $resolvedOverrides[$permName] = $boolGranted;

            // If this is a module key, expand to all its granular counterparts
            if (isset(self::MODULE_TO_GRANULAR[$permName])) {
                foreach (self::MODULE_TO_GRANULAR[$permName] as $granularKey) {
                    $resolvedOverrides[$granularKey] = $boolGranted;
                }
            }
        }

        // Insert overrides for all matched permissions in database
        $insertStmt = $db->prepare(
            'INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (:uid, :pid, :granted)'
        );

        foreach ($resolvedOverrides as $permName => $granted) {
            if (isset($permMap[$permName])) {
                $insertStmt->execute([
                    'uid'     => $userId,
                    'pid'     => $permMap[$permName],
                    'granted' => $granted ? 1 : 0,
                ]);
            }
        }

        // Create an audit notification so staff client receives instant signal
        try {
            \App\Repositories\NotificationRepository::create(
                $userId,
                null,
                'Permissions Updated',
                'Your staff account permissions have been updated by an administrator.',
                'permissions_updated'
            );
        } catch (\Throwable) {
            // Ignore if notification cannot be dispatched
        }
    }
}
