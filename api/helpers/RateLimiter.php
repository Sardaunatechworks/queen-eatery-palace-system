<?php
/**
 * Queen Eatery Palace - Rate Limiter
 * 
 * Secure, file-based rate limiter to protect endpoints from abuse.
 * Restricts request frequency per IP address.
 */

declare(strict_types=1);

namespace App\Helpers;

class RateLimiter
{
    private static string $limitDir = __DIR__ . '/../private/rate_limits';
    private static int $maxRequests = 100; // 100 requests
    private static int $timeWindow = 60;   // per 60 seconds

    /**
     * Check if request exceeds rate limit. If so, outputs 429 and aborts.
     */
    public static function check(): void
    {
        // Don't rate limit CLI execution
        if (PHP_SAPI === 'cli') {
            return;
        }

        if (!file_exists(self::$limitDir)) {
            mkdir(self::$limitDir, 0755, true);
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $fileKey = md5($ip);
        $filePath = self::$limitDir . '/rl_' . $fileKey . '.json';

        $now = time();
        $timestamps = [];

        if (file_exists($filePath)) {
            $data = json_decode(file_get_contents($filePath), true);
            if (is_array($data)) {
                $timestamps = $data;
            }
        }

        // Filter out expired timestamps
        $cutoff = $now - self::$timeWindow;
        $timestamps = array_filter($timestamps, fn($t) => $t > $cutoff);

        if (count($timestamps) >= self::$maxRequests) {
            // Rate limit exceeded
            header('HTTP/1.1 429 Too Many Requests');
            header('Content-Type: application/json; charset=utf-8');
            header('Retry-After: ' . (min($timestamps) + self::$timeWindow - $now));
            
            echo json_encode([
                'success' => false,
                'message' => 'Too many requests. Please slow down and try again later.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Add current timestamp and save
        $timestamps[] = $now;
        file_put_contents($filePath, json_encode(array_values($timestamps)));
    }
}
