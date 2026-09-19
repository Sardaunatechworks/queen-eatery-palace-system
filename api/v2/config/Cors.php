<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CORS Configuration
 */

declare(strict_types=1);

namespace App\Config;

class Cors
{
    public static function handle(): void
    {
        $config = Database::getFullConfig();
        $allowedOrigins = $config['cors']['allowed_origins'] ?? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        $isAllowed = in_array($origin, $allowedOrigins, true) 
            || in_array('*', $allowedOrigins, true)
            || (!empty($origin) && (bool) preg_match('/^https:\/\/[a-z0-9\-_.]+\.vercel\.app$/i', $origin));

        if ($isAllowed && !empty($origin)) {
            header("Access-Control-Allow-Origin: {$origin}");
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
        header('Access-Control-Expose-Headers: Content-Disposition');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
        header('Permissions-Policy: unload=*');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
