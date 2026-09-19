<?php
/**
 * Queen Eatery Palace - CORS Configuration
 * 
 * Handles Cross-Origin Resource Sharing headers.
 */

declare(strict_types=1);

namespace App\Config;

class Cors
{
    /**
     * Apply CORS headers to the response.
     */
    public static function handle(): void
    {
        $config = self::getConfig();
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        $isLocalhost = (bool)preg_match('/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i', $origin);

        // Check if origin is allowed or is localhost dev
        if (in_array($origin, $config['allowed_origins'] ?? [], true) || $isLocalhost) {
            header("Access-Control-Allow-Origin: {$origin}");
        }

        header('Access-Control-Allow-Methods: ' . implode(', ', $config['allowed_methods']));
        header('Access-Control-Allow-Headers: ' . implode(', ', $config['allowed_headers']));
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: ' . $config['max_age']);

        // Handle preflight requests
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /**
     * Load CORS config from private config file.
     */
    private static function getConfig(): array
    {
        $configPath = dirname(__DIR__) . '/private/config.php';
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';

        if (file_exists($privatePath)) {
            $config = require $privatePath;
        } elseif (file_exists($configPath)) {
            $config = require $configPath;
        } else {
            // Fallback defaults
            return [
                'allowed_origins' => ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
                'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With'],
                'max_age'         => 86400,
            ];
        }

        return $config['cors'] ?? [];
    }
}
