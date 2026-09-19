<?php
/**
 * Queen Eatery Palace - Database Connection (PDO)
 * 
 * Singleton PDO connection with proper error handling.
 * Uses prepared statements exclusively to prevent SQL injection.
 */

declare(strict_types=1);

namespace App\Config;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $instance = null;

    /**
     * Get the singleton PDO instance.
     */
    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            $config = self::getConfig();
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                $config['host'],
                $config['port'],
                $config['name'],
                $config['charset']
            );

            try {
                self::$instance = new PDO($dsn, $config['user'], $config['password'], [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_PERSISTENT         => true,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
                ]);
            } catch (PDOException $e) {
                if (PHP_SAPI === 'cli') {
                    echo "\n[ERROR] Database connection failed:\n";
                    echo "DSN: {$dsn}\n";
                    echo "User: {$config['user']}\n";
                    echo "Message: {$e->getMessage()}\n\n";
                    exit(1);
                }
                // Never expose database details in production
                $appConfig = self::getAppConfig();
                if ($appConfig['debug'] ?? false) {
                    throw $e;
                }
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Database connection failed']);
                exit;
            }
        }

        return self::$instance;
    }

    /**
     * Load database configuration from private config file.
     */
    private static function getConfig(): array
    {
        $config = self::loadFullConfig();
        return $config['db'];
    }

    /**
     * Load application configuration.
     */
    private static function getAppConfig(): array
    {
        $config = self::loadFullConfig();
        return $config['app'] ?? [];
    }

    /**
     * Load the full configuration file.
     */
    private static function loadFullConfig(): array
    {
        // Try private config location first (production: outside public_html)
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';
        // Fallback to local dev location
        $devPath = dirname(__DIR__) . '/private/config.php';

        if (file_exists($privatePath)) {
            return require $privatePath;
        } elseif (file_exists($devPath)) {
            return require $devPath;
        }

        throw new \RuntimeException('Configuration file not found');
    }

    /**
     * Close the connection (for testing or explicit cleanup).
     */
    public static function close(): void
    {
        self::$instance = null;
    }
}
