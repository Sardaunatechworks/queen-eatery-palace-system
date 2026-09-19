<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Database Connection
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
            $config = self::getDbConfig();
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
     * Load database configuration.
     */
    private static function getDbConfig(): array
    {
        return self::loadFullConfig()['db'];
    }

    /**
     * Load application configuration.
     */
    public static function getAppConfig(): array
    {
        return self::loadFullConfig()['app'] ?? [];
    }

    /**
     * Get full configuration array.
     */
    public static function getFullConfig(): array
    {
        return self::loadFullConfig();
    }

    /**
     * Load the configuration file.
     * Priority: production (outside public_html) > local dev
     */
    private static function loadFullConfig(): array
    {
        static $config = null;
        if ($config !== null) {
            return $config;
        }

        $possiblePaths = [
            dirname(__DIR__, 2) . '/private/config.php',
            dirname(__DIR__, 3) . '/private/config.php',
            dirname(__DIR__, 1) . '/private/config.php',
            __DIR__ . '/../../private/config.php',
            __DIR__ . '/../private/config.php',
        ];

        foreach ($possiblePaths as $path) {
            if (file_exists($path)) {
                $config = require $path;
                return $config;
            }
        }

        throw new \RuntimeException('Configuration file (private/config.php) not found');
    }

    /**
     * Close the connection.
     */
    public static function close(): void
    {
        self::$instance = null;
    }
}
