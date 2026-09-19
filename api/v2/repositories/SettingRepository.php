<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Setting Repository
 *
 * Encapsulates CRUD operations for the `system_settings` table.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class SettingRepository
{
    /**
     * Get a setting value by its key.
     * Returns $default if setting does not exist.
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT value FROM system_settings WHERE key_name = :key LIMIT 1');
        $stmt->execute(['key' => $key]);
        $val = $stmt->fetchColumn();

        return $val !== false ? $val : $default;
    }

    /**
     * Set/update a setting value.
     */
    public static function set(string $key, string $value, ?string $displayName = null, ?string $description = null, ?int $userId = null): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO system_settings (key_name, value, display_name, description, updated_by)
            VALUES (:key, :value, :display_name, :description, :user_id)
            ON DUPLICATE KEY UPDATE
                value = VALUES(value),
                display_name = COALESCE(VALUES(display_name), display_name),
                description = COALESCE(VALUES(description), description),
                updated_by = VALUES(updated_by),
                updated_at = NOW()
        ');
        $stmt->execute([
            'key'          => $key,
            'value'        => $value,
            'display_name' => $displayName,
            'description'  => $description,
            'user_id'      => $userId,
        ]);
    }

    /**
     * Fetch all settings as key-value pairs or full objects.
     */
    public static function getAll(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('SELECT key_name, value, display_name, description, updated_at FROM system_settings');
        return $stmt->fetchAll();
    }
}
