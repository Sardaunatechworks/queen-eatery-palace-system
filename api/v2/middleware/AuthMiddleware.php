<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Auth Middleware
 *
 * Verifies JWT tokens and loads user data from the database.
 * Never trusts role/permission information from the token alone.
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Response;
use App\Services\JWTService;
use App\Repositories\UserRepository;

class AuthMiddleware
{
    /**
     * Check authorization state without exiting.
     * Returns ['success' => true, 'user' => [...]] or ['success' => false, 'status' => 401|403, 'message' => '...'].
     */
    public static function check(): array
    {
        $token = self::extractToken();

        if ($token === null) {
            return ['success' => false, 'status' => 401, 'message' => 'Missing or invalid authorization token'];
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);

        if ($payload === null) {
            return ['success' => false, 'status' => 401, 'message' => 'Invalid or expired token'];
        }

        $userId = (int) ($payload['sub'] ?? 0);
        $user = UserRepository::findWithPermissions($userId);

        if ($user === null) {
            return ['success' => false, 'status' => 401, 'message' => 'User account not found'];
        }

        if ($user['status'] !== STATUS_ACTIVE) {
            return ['success' => false, 'status' => 403, 'message' => 'Your account is ' . $user['status'] . '. Contact an administrator.'];
        }

        $csrfError = CSRFMiddleware::check();
        if ($csrfError !== null) {
            return ['success' => false, 'status' => 403, 'message' => $csrfError];
        }

        return ['success' => true, 'user' => $user];
    }

    /**
     * Verify the JWT access token from cookie or Authorization header.
     * Populates $_REQUEST['auth_user'] with full user data from the database, or halts with 401/403.
     */
    public static function verify(): void
    {
        $result = self::check();

        if (!$result['success']) {
            if ($result['status'] === 401) {
                Response::unauthorized($result['message']);
            } else {
                Response::forbidden($result['message']);
            }
        }

        $_REQUEST['auth_user'] = $result['user'];
    }

    /**
     * Optional authentication — doesn't fail if no token is present.
     */
    public static function optional(): void
    {
        $result = self::check();
        $_REQUEST['auth_user'] = $result['success'] ? $result['user'] : null;
    }

    /**
     * Extract access token from HttpOnly cookie first, with Bearer header fallback.
     */
    private static function extractToken(): ?string
    {
        // 1. Prioritize Secure, HttpOnly cookie
        if (!empty($_COOKIE[\App\Helpers\CookieHelper::ACCESS_COOKIE])) {
            $token = trim((string) $_COOKIE[\App\Helpers\CookieHelper::ACCESS_COOKIE]);
            if ($token !== '') {
                return $token;
            }
        }

        // 2. Fallback to Authorization header (CLI test suites, external integrations)
        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        if (!empty($authHeader) && str_starts_with($authHeader, 'Bearer ')) {
            $token = trim(substr($authHeader, 7));
            return $token !== '' ? $token : null;
        }

        return null;
    }
}
