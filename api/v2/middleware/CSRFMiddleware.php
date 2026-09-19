<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CSRF Middleware
 *
 * Enforces Cross-Site Request Forgery defenses for cookie-authenticated sessions.
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Database;
use App\Helpers\CookieHelper;
use App\Helpers\Response;

class CSRFMiddleware
{
    /**
     * Check CSRF token and origin for state-changing requests.
     * Returns null if valid, or an error message string if invalid.
     */
    public static function check(): ?string
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        // Safe methods do not modify server state
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return null;
        }

        // Exempt webhook endpoints that use cryptographic HMAC signatures
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        if (str_contains($uri, '/payments/paystack/webhook')) {
            return null;
        }

        // Check if session is authenticated via cookie
        $cookieToken = $_COOKIE[CookieHelper::ACCESS_COOKIE] ?? null;
        if (empty($cookieToken)) {
            // Pure Bearer token or unauthenticated public endpoints bypass CSRF cookie check
            return null;
        }

        // 1. Origin header check
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if (!empty($origin)) {
            $config = Database::getFullConfig();
            $allowedOrigins = $config['cors']['allowed_origins'] ?? ['http://localhost:3000', 'http://localhost:5173'];
            $isAllowed = in_array($origin, $allowedOrigins, true) 
                || in_array('*', $allowedOrigins, true)
                || (bool) preg_match('/^https:\/\/[a-z0-9\-_.]+\.vercel\.app$/i', $origin);
            if (!$isAllowed) {
                return 'Cross-origin request rejected (invalid origin)';
            }
        }

        // 2. Custom header and CSRF token check
        $csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
        $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? null;
        $expectedCsrf = $_COOKIE[CookieHelper::CSRF_COOKIE] ?? null;

        // Valid if X-Requested-With is XMLHttpRequest OR X-CSRF-Token matches the CSRF cookie
        $hasCustomHeader = ($requestedWith !== null && strtolower($requestedWith) === 'xmlhttprequest');
        $matchesCsrfToken = (!empty($csrfHeader) && !empty($expectedCsrf) && hash_equals($expectedCsrf, $csrfHeader));

        if (!$hasCustomHeader && !$matchesCsrfToken) {
            return 'CSRF verification failed';
        }

        return null;
    }

    /**
     * Verify CSRF token and origin for state-changing requests. Halts request on failure.
     */
    public static function verify(): void
    {
        $error = self::check();
        if ($error !== null) {
            Response::forbidden($error);
        }
    }
}
