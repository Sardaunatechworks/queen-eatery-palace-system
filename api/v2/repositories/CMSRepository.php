<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CMS Repository
 *
 * Data access layer for Content Management System payloads and page configurations.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class CMSRepository
{
    /**
     * Get CMS section data decoded as an array.
     */
    public static function getSection(string $section = 'landing_page', string $key = 'data'): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT value, updated_at 
            FROM cms_content 
            WHERE section = :sec AND key_name = :k 
            LIMIT 1
        ');
        $stmt->execute(['sec' => $section, 'k' => $key]);
        $row = $stmt->fetch();

        if ($row && !empty($row['value'])) {
            $decoded = json_decode($row['value'], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Upsert CMS section data as JSON.
     */
    public static function upsertSection(string $section, string $key, array $data, ?int $userId): bool
    {
        $db = Database::getConnection();
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt = $db->prepare('
            INSERT INTO cms_content (section, key_name, value, updated_by)
            VALUES (:sec, :k, :val, :uid)
            ON DUPLICATE KEY UPDATE 
                value = :val_up,
                updated_by = :uid_up,
                updated_at = CURRENT_TIMESTAMP
        ');

        return $stmt->execute([
            'sec'    => $section,
            'k'      => $key,
            'val'    => $json,
            'uid'    => $userId,
            'val_up' => $json,
            'uid_up' => $userId,
        ]);
    }

    /**
     * List all CMS sections.
     */
    public static function listSections(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT id, section, key_name, sort_order, updated_at 
            FROM cms_content 
            ORDER BY section ASC, sort_order ASC
        ');
        return $stmt->fetchAll();
    }
}
