<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Rate Limiter
 *
 * File-based rate limiting optimized for concurrent users on shared hosting and reverse proxies.
 */

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Database;
use App\Helpers\Response;

class RateLimiter
{
    private static string $storageDir = '';

    /**
     * Check rate limit for the current request.
     */
    public static function check(): void
    {
        $config = self::getConfig();
        if (!($config['enabled'] ?? true)) {
            return;
        }

        // Exempt public read-only catalog requests from rate throttling
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        if ($method === 'GET') {
            if (
                str_contains($uri, '/api/v2/menu') ||
                str_contains($uri, '/api/v2/categories') ||
                str_contains($uri, '/api/v2/cms') ||
                str_contains($uri, '/api/v2/settings') ||
                str_contains($uri, '/api/v2/qr/menu')
            ) {
                return;
            }
        }

        $maxRequests = (int) ($config['max_requests'] ?? 600);
        $windowSeconds = (int) ($config['window_seconds'] ?? 60);
        $ip = self::getClientIp();
        $key = 'req_' . md5($ip);

        self::$storageDir = sys_get_temp_dir() . '/qep_rate_limit';
        if (!is_dir(self::$storageDir)) {
            @mkdir(self::$storageDir, 0755, true);
        }

        $file = self::$storageDir . '/' . $key . '.json';
        $now = time();
        $data = ['requests' => [], 'blocked_until' => 0];

        if (file_exists($file)) {
            $contents = @file_get_contents($file);
            if ($contents) {
                $data = json_decode($contents, true) ?: $data;
            }
        }

        // Check if currently blocked
        if (($data['blocked_until'] ?? 0) > $now) {
            $retryAfter = $data['blocked_until'] - $now;
            header("Retry-After: {$retryAfter}");
            Response::tooManyRequests('Too many requests. Please slow down and try again shortly.');
        }

        // Filter out expired timestamps
        $data['requests'] = array_filter(
            $data['requests'] ?? [],
            fn($ts) => $ts > ($now - $windowSeconds)
        );

        // Check limit
        if (count($data['requests']) >= $maxRequests) {
            $data['blocked_until'] = $now + 30; // Short 30-second backoff for API limit
            @file_put_contents($file, json_encode($data), LOCK_EX);
            header('Retry-After: 30');
            Response::tooManyRequests('Too many requests. Please slow down and try again shortly.');
        }

        // Record request
        $data['requests'][] = $now;
        @file_put_contents($file, json_encode($data), LOCK_EX);
    }

    /**
     * Rate limit for sensitive authentication endpoints (login, signup, password reset).
     * Accommodates concurrent users on shared IP networks (Wi-Fi, CGNAT) while preventing abuse.
     */
    public static function checkAuth(?string $identifier = null): void
    {
        $config = self::getConfig();
        $ip = self::getClientIp();

        // 1. IP-level auth rate limit (allows up to 60 auth attempts per 5 minutes per IP)
        $ipMaxAttempts = (int) ($config['auth_max'] ?? 60);
        $windowSeconds = (int) ($config['auth_window'] ?? 300);

        self::$storageDir = sys_get_temp_dir() . '/qep_rate_limit';
        if (!is_dir(self::$storageDir)) {
            @mkdir(self::$storageDir, 0755, true);
        }

        $now = time();
        $ipKey = 'auth_ip_' . md5($ip);
        $ipFile = self::$storageDir . '/' . $ipKey . '.json';
        $ipData = ['requests' => [], 'blocked_until' => 0];

        if (file_exists($ipFile)) {
            $contents = @file_get_contents($ipFile);
            if ($contents) {
                $ipData = json_decode($contents, true) ?: $ipData;
            }
        }

        if (($ipData['blocked_until'] ?? 0) > $now) {
            $retryAfter = $ipData['blocked_until'] - $now;
            header("Retry-After: {$retryAfter}");
            Response::tooManyRequests('Too many authentication attempts from this network. Please try again in a few minutes.');
        }

        $ipData['requests'] = array_filter(
            $ipData['requests'] ?? [],
            fn($ts) => $ts > ($now - $windowSeconds)
        );

        if (count($ipData['requests']) >= $ipMaxAttempts) {
            $ipData['blocked_until'] = $now + $windowSeconds;
            @file_put_contents($ipFile, json_encode($ipData), LOCK_EX);
            header("Retry-After: {$windowSeconds}");
            Response::tooManyRequests('Too many authentication attempts from this network. Please try again in 5 minutes.');
        }

        $ipData['requests'][] = $now;
        @file_put_contents($ipFile, json_encode($ipData), LOCK_EX);

        // 2. Account-specific rate limit (prevents brute forcing an individual account)
        if ($identifier !== null && $identifier !== '') {
            $userKey = 'auth_user_' . md5(strtolower(trim($identifier)));
            $userFile = self::$storageDir . '/' . $userKey . '.json';
            $userData = ['requests' => [], 'blocked_until' => 0];

            if (file_exists($userFile)) {
                $uContents = @file_get_contents($userFile);
                if ($uContents) {
                    $userData = json_decode($uContents, true) ?: $userData;
                }
            }

            if (($userData['blocked_until'] ?? 0) > $now) {
                $retryAfter = $userData['blocked_until'] - $now;
                header("Retry-After: {$retryAfter}");
                Response::tooManyRequests('Too many failed login attempts for this account. Please wait 5 minutes before trying again.');
            }

            $userData['requests'] = array_filter(
                $userData['requests'] ?? [],
                fn($ts) => $ts > ($now - $windowSeconds)
            );

            // 15 attempts per account per 5 minutes
            if (count($userData['requests']) >= 15) {
                $userData['blocked_until'] = $now + $windowSeconds;
                @file_put_contents($userFile, json_encode($userData), LOCK_EX);
                header("Retry-After: {$windowSeconds}");
                Response::tooManyRequests('Too many failed login attempts for this account. Please wait 5 minutes before trying again.');
            }

            $userData['requests'][] = $now;
            @file_put_contents($userFile, json_encode($userData), LOCK_EX);
        }
    }

    /**
     * Get client IP address accurately, handling reverse proxies and CDN headers.
     */
    public static function getClientIp(): string
    {
        $keys = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_REAL_IP',
            'HTTP_X_FORWARDED_FOR',
            'REMOTE_ADDR',
        ];

        foreach ($keys as $key) {
            if (!empty($_SERVER[$key])) {
                $ips = explode(',', (string) $_SERVER[$key]);
                foreach ($ips as $candidate) {
                    $candidate = trim($candidate);
                    if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                        return $candidate;
                    }
                }
            }
        }

        return '127.0.0.1';
    }

    /**
     * Get rate limit configuration from settings.
     */
    private static function getConfig(): array
    {
        try {
            $config = Database::getFullConfig();
            if (isset($config['rate_limit'])) {
                return $config['rate_limit'];
            }
            if (isset($config['security'])) {
                return [
                    'enabled'        => true,
                    'max_requests'   => $config['security']['rate_limit_max_api'] ?? 600,
                    'window_seconds' => 60,
                    'auth_max'       => $config['security']['rate_limit_max_auth'] ?? 60,
                    'auth_window'    => 300,
                ];
            }
            return [
                'enabled'        => true,
                'max_requests'   => 600,
                'window_seconds' => 60,
                'auth_max'       => 60,
                'auth_window'    => 300,
            ];
        } catch (\Throwable $e) {
            return [
                'enabled'        => true,
                'max_requests'   => 600,
                'window_seconds' => 60,
                'auth_max'       => 60,
                'auth_window'    => 300,
            ];
        }
    }
}
