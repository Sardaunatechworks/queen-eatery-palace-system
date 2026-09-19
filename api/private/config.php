<?php
/**
 * Queen Eatery Palace - Private Configuration
 * 
 * SECURITY: This file MUST be placed OUTSIDE the public_html directory.
 * On DirectAdmin, place it in: /home/<username>/private/config.php
 * 
 * For development, this file lives at: api/private/config.php
 * The .htaccess in the api directory blocks direct access to the private folder.
 */

// Prevent direct access
if (!defined('QEP_APP')) {
    http_response_code(403);
    exit('Direct access forbidden.');
}

// Automatically load .env if present in api/ or project root
$envPaths = [
    dirname(__DIR__) . '/.env',
    dirname(__DIR__, 2) . '/.env',
    __DIR__ . '/.env',
];
foreach ($envPaths as $envFile) {
    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) continue;
                if (str_contains($line, '=')) {
                    [$k, $v] = explode('=', $line, 2);
                    $k = trim($k);
                    $v = trim($v, " \t\n\r\0\x0B\"'");
                    putenv("{$k}={$v}");
                    $_ENV[$k] = $v;
                    $_SERVER[$k] = $v;
                }
            }
        }
        break;
    }
}

return [
    // Database
    'db' => [
        'host'     => $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1',
        'name'     => $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: 'queenspa_queen_eatery',
        'user'     => $_ENV['DB_USER'] ?? getenv('DB_USER') ?: 'queenspa_queen_eatery',
        'password' => $_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: '',
        'charset'  => 'utf8mb4',
        'port'     => $_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: '3306',
    ],

    // JWT
    'jwt' => [
        'secret'          => getenv('JWT_SECRET') ?: 'CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_64_CHARS',
        'access_ttl'      => 900,        // 15 minutes
        'refresh_ttl'     => 604800,     // 7 days
        'algorithm'       => 'HS256',
        'issuer'          => 'queenspalaceeatery.com',
    ],

    // Paystack
    'paystack' => [
        'secret_key' => getenv('PAYSTACK_SECRET_KEY') ?: '',
        'public_key' => getenv('PAYSTACK_PUBLIC_KEY') ?: '',
        'base_url'   => 'https://api.paystack.co',
    ],

    // SMTP Mail
    'mail' => [
        'host'       => getenv('SMTP_HOST') ?: 'mail.queenspalaceeatery.com',
        'port'       => (int)(getenv('SMTP_PORT') ?: 587),
        'username'   => getenv('SMTP_USERNAME') ?: 'noreply@queenspalaceeatery.com',
        'password'   => getenv('SMTP_PASSWORD') ?: '',
        'encryption' => getenv('SMTP_ENCRYPTION') ?: 'tls',
        'from_email' => getenv('SMTP_FROM_EMAIL') ?: 'noreply@queenspalaceeatery.com',
        'from_name'  => getenv('SMTP_FROM_NAME') ?: "Queen's Palace Eatery",
    ],

    // Application
    'app' => [
        'name'        => "Queen's Palace Eatery & Event Hall",
        'url'         => getenv('APP_URL') ?: 'https://queenspalaceeatery.com',
        'api_url'     => getenv('API_URL') ?: 'https://api.queenspalaceeatery.com',
        'environment' => getenv('APP_ENV') ?: 'production',
        'debug'       => (bool)(getenv('APP_DEBUG') ?: false),
    ],

    // File Upload
    'uploads' => [
        'base_path'       => dirname(__DIR__) . '/uploads',
        'base_url'        => '/uploads',
        'max_size'        => 5 * 1024 * 1024, // 5MB
        'allowed_types'   => ['image/jpeg', 'image/png', 'image/webp'],
        'allowed_extensions' => ['jpg', 'jpeg', 'png', 'webp'],
    ],

    // CORS
    'cors' => [
        'allowed_origins' => [
            'https://queenspalaceeatery.com',
            'https://www.queenspalaceeatery.com',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
        ],
        'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With'],
        'max_age'         => 86400,
    ],

    // Rate Limiting (Multi-user concurrency & shared network support)
    'rate_limit' => [
        'enabled'        => true,
        'max_requests'   => 600,   // 600 requests per 60s per IP (comfortable for concurrent SPA users)
        'window_seconds' => 60,
        'auth_max'       => 60,    // 60 auth attempts per 5 minutes per IP
        'auth_window'    => 300,
    ],

    // Security
    'security' => [
        'rate_limit_window'   => 300,
        'rate_limit_max_auth' => 60,
        'rate_limit_max_api'  => 600,
        'bcrypt_cost'         => 12,
    ],
];

