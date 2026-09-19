<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Category Repository
 *
 * All category-related SQL queries live here.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class CategoryRepository
{
    /**
     * Find all categories ordered by sort_order, then name.
     */
    public static function findAll(): array
    {
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT id, name, sort_order, status, created_at
            FROM categories
            ORDER BY sort_order ASC, name ASC
        ');
        return $stmt->fetchAll();
    }

    /**
     * Find a category by ID.
     */
    public static function findById(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM categories WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Check if a category name already exists (optionally excluding an ID).
     */
    public static function nameExists(string $name, ?int $excludeId = null): bool
    {
        $db = Database::getConnection();
        $sql = 'SELECT COUNT(id) FROM categories WHERE name = :name';
        $params = ['name' => $name];

        if ($excludeId !== null) {
            $sql .= ' AND id != :exclude_id';
            $params['exclude_id'] = $excludeId;
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Create a new category. Returns the new ID.
     */
    public static function create(string $name, int $sortOrder = 0): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO categories (name, sort_order, status)
            VALUES (:name, :sort_order, :status)
        ');
        $stmt->execute([
            'name'       => $name,
            'sort_order' => $sortOrder,
            'status'     => 'active',
        ]);
        return (int) $db->lastInsertId();
    }

    /**
     * Update a category. Supports name, sort_order, status.
     */
    public static function update(int $id, array $data): void
    {
        $db = Database::getConnection();
        $fields = [];
        $params = ['id' => $id];

        $allowed = ['name', 'sort_order', 'status'];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $fields[] = "`{$field}` = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if (empty($fields)) {
            return;
        }

        $sql = 'UPDATE categories SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Delete a category.
     */
    public static function delete(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM categories WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Count menu items referencing this category.
     */
    public static function countMenuItems(int $id): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT COUNT(id) FROM menu_items WHERE category_id = :id');
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }
}
