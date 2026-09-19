<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Cookie Helper
 *
 * Manages Secure, HttpOnly authentication cookies and CSRF tokens.
 */

declare(strict_types=1);

namespace App\Helpers;

class CookieHelper
{
    public const ACCESS_COOKIE = 'qep_access_token';
    public const REFRESH_COOKIE = 'qep_refresh_token';
    public const CSRF_COOKIE = 'qep_csrf_token';

    /**
     * Check whether current request or production environment requires HTTPS Secure cookies.
     */
    public static function isSecure(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') {
            return true;
        }

        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
            return true;
        }

        if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
            return true;
        }

        $appEnv = getenv('APP_ENV') ?: 'production';
        $appUrl = getenv('APP_URL') ?: '';
        if ($appEnv === 'production' && str_starts_with($appUrl, 'https://')) {
            return true;
        }

        return false;
    }

    /**
     * Set secure authentication cookies and CSRF token.
     */
    public static function setAuthCookies(
        string $accessToken,
        string $refreshToken,
        int $accessTtl = 900,
        int $refreshTtl = 604800,
        ?string $csrfToken = null
    ): void {
        $secure = self::isSecure();
        $sameSite = $secure ? 'None' : 'Lax';
        $now = time();

        // 1. Access Token (HttpOnly, short-lived)
        @setcookie(self::ACCESS_COOKIE, $accessToken, [
            'expires'  => $now + $accessTtl,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $sameSite,
        ]);

        // 2. Refresh Token (HttpOnly, long-lived)
        @setcookie(self::REFRESH_COOKIE, $refreshToken, [
            'expires'  => $now + $refreshTtl,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $sameSite,
        ]);

        // 3. CSRF Token (Readable by JavaScript for double-submit header check)
        $csrf = $csrfToken ?: self::generateCsrfToken();
        @setcookie(self::CSRF_COOKIE, $csrf, [
            'expires'  => $now + $refreshTtl,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => false,
            'samesite' => $sameSite,
        ]);

        // Also make available in $_COOKIE for current request lifecycle
        $_COOKIE[self::ACCESS_COOKIE] = $accessToken;
        $_COOKIE[self::REFRESH_COOKIE] = $refreshToken;
        $_COOKIE[self::CSRF_COOKIE] = $csrf;
    }

    /**
     * Clear all authentication and CSRF cookies on logout or session invalidation.
     */
    public static function clearAuthCookies(): void
    {
        $secure = self::isSecure();
        $sameSite = $secure ? 'None' : 'Lax';

        $cookieOptions = [
            'expires'  => 1,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $sameSite,
        ];

        @setcookie(self::ACCESS_COOKIE, '', $cookieOptions);
        @setcookie(self::REFRESH_COOKIE, '', $cookieOptions);

        $cookieOptions['httponly'] = false;
        @setcookie(self::CSRF_COOKIE, '', $cookieOptions);

        unset($_COOKIE[self::ACCESS_COOKIE]);
        unset($_COOKIE[self::REFRESH_COOKIE]);
        unset($_COOKIE[self::CSRF_COOKIE]);
    }

    /**
     * Generate a cryptographically secure random token for CSRF defense.
     */
    public static function generateCsrfToken(): string
    {
        return bin2hex(random_bytes(32));
    }
}
