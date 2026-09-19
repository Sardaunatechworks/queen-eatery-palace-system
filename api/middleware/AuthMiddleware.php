<?php
/**
 * Queen Eatery Palace - Auth Middleware
 * 
 * Verifies JWT tokens and loads user data from the database.
 * Never trusts role/permission information from the token alone.
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Database;
use App\Helpers\Response;
use App\Services\JWTService;

class AuthMiddleware
{
    /**
     * Verify the JWT access token from the Authorization header.
     * Populates $_REQUEST['auth_user'] with full user data from the database.
     */
    public static function verify(): void
    {
        $token = self::extractToken();

        if ($token === null) {
            Response::unauthorized('Missing or invalid authorization token');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);

        if ($payload === null) {
            Response::unauthorized('Invalid or expired token');
        }

        // Fetch full user data from database (never trust token payload for role/permissions)
        $userId = (int) ($payload['sub'] ?? 0);
        $user = self::fetchUser($userId);

        if ($user === null) {
            Response::unauthorized('User account not found');
        }

        // Check user status
        if ($user['status'] !== 'active') {
            Response::forbidden('Your account is ' . $user['status'] . '. Contact an administrator.');
        }

        // Store authenticated user data in request
        $_REQUEST['auth_user'] = $user;
    }

    /**
     * Optional authentication - doesn't fail if no token is present.
     * Populates $_REQUEST['auth_user'] if token exists and is valid.
     */
    public static function optional(): void
    {
        $token = self::extractToken();

        if ($token === null) {
            $_REQUEST['auth_user'] = null;
            return;
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);

        if ($payload === null) {
            $_REQUEST['auth_user'] = null;
            return;
        }

        $userId = (int) ($payload['sub'] ?? 0);
        $user = self::fetchUser($userId);

        $_REQUEST['auth_user'] = ($user && $user['status'] === 'active') ? $user : null;
    }

    /**
     * Extract the Bearer token from the Authorization header.
     */
    private static function extractToken(): ?string
    {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        if (empty($authHeader) || !str_starts_with($authHeader, 'Bearer ')) {
            return null;
        }

        $token = trim(substr($authHeader, 7));
        return $token !== '' ? $token : null;
    }

    /**
     * Fetch full user data including role and permissions from database.
     */
    private static function fetchUser(int $userId): ?array
    {
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
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if (!$user) {
            return null;
        }

        // Load user's effective permissions (role defaults + per-user overrides)
        $user['permissions'] = self::loadPermissions($userId, (int) $user['role_id']);

        return $user;
    }

    /**
     * Load effective permissions for a user.
     * Combines role-level defaults with per-user overrides.
     */
    private static function loadPermissions(int $userId, int $roleId): array
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

        // Get per-user permission overrides
        $stmt = $db->prepare('SELECT permission_id, granted FROM user_permissions WHERE user_id = :uid');
        $stmt->execute(['uid' => $userId]);
        $userOverrides = [];
        foreach ($stmt->fetchAll() as $row) {
            $userOverrides[(int) $row['permission_id']] = (bool) $row['granted'];
        }

        // Build effective permissions map
        $permissions = [];
        foreach ($allPermissions as $perm) {
            $permId = (int) $perm['id'];
            $permName = $perm['name'];

            // Check user-level override first, then role-level default
            if (isset($userOverrides[$permId])) {
                $permissions[$permName] = $userOverrides[$permId];
            } else {
                $permissions[$permName] = in_array($permId, $rolePermIds);
            }
        }

        return $permissions;
    }
}
