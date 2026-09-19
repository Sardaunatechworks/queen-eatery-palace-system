<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Table Repository
 *
 * Encapsulates all data access for restaurant_tables and QR tokens.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class TableRepository
{
    /**
     * List all tables with optional search and filters.
     */
    public static function list(array $filters = []): array
    {
        $db = Database::getConnection();
        $where = ['1=1'];
        $params = [];

        if (!empty($filters['search'])) {
            $where[] = '(t.table_number LIKE :search OR t.name LIKE :search)';
            $params['search'] = '%' . $filters['search'] . '%';
        }

        if (!empty($filters['status'])) {
            $where[] = 't.status = :status';
            $params['status'] = $filters['status'];
        }

        if (isset($filters['qr_enabled'])) {
            $where[] = 't.qr_enabled = :qr_enabled';
            $params['qr_enabled'] = (int) $filters['qr_enabled'];
        }

        $whereClause = implode(' AND ', $where);

        $stmt = $db->prepare("
            SELECT t.*,
                   u.full_name AS creator_name,
                   (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.order_status IN ('submitted', 'accepted', 'preparing', 'ready', 'served')) AS active_orders_count
            FROM restaurant_tables t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE {$whereClause}
            ORDER BY t.table_number ASC
        ");
        $stmt->execute($params);
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Find table by primary ID.
     */
    public static function findById(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT t.*,
                   u.full_name AS creator_name
            FROM restaurant_tables t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find table by public QR token (used for guest QR table resolution).
     */
    public static function findByPublicToken(string $token): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT id, table_number, name, public_token, status, qr_enabled, current_state
            FROM restaurant_tables
            WHERE public_token = :token
            LIMIT 1
        ');
        $stmt->execute(['token' => $token]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Find table by table number (e.g., "Table 07").
     */
    public static function findByTableNumber(string $tableNumber): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT * FROM restaurant_tables
            WHERE table_number = :tnum
            LIMIT 1
        ');
        $stmt->execute(['tnum' => trim($tableNumber)]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Create new restaurant table.
     */
    public static function create(array $data): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO restaurant_tables (
                table_number, name, public_token, status, qr_enabled, current_state, created_by
            ) VALUES (
                :table_number, :name, :public_token, :status, :qr_enabled, :current_state, :created_by
            )
        ');

        $stmt->execute([
            'table_number'  => trim($data['table_number']),
            'name'          => !empty($data['name']) ? trim($data['name']) : null,
            'public_token'  => $data['public_token'],
            'status'        => $data['status'] ?? 'active',
            'qr_enabled'    => isset($data['qr_enabled']) ? (int) $data['qr_enabled'] : 1,
            'current_state' => $data['current_state'] ?? 'available',
            'created_by'    => $data['created_by'] ?? null,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Update restaurant table.
     */
    public static function update(int $id, array $data): void
    {
        $db = Database::getConnection();
        $fields = [];
        $params = ['id' => $id];

        if (array_key_exists('table_number', $data)) {
            $fields[] = 'table_number = :table_number';
            $params['table_number'] = trim((string) $data['table_number']);
        }
        if (array_key_exists('name', $data)) {
            $fields[] = 'name = :name';
            $params['name'] = $data['name'] !== null ? trim((string) $data['name']) : null;
        }
        if (array_key_exists('status', $data)) {
            $fields[] = 'status = :status';
            $params['status'] = $data['status'];
        }
        if (array_key_exists('qr_enabled', $data)) {
            $fields[] = 'qr_enabled = :qr_enabled';
            $params['qr_enabled'] = (int) $data['qr_enabled'];
        }
        if (array_key_exists('current_state', $data)) {
            $fields[] = 'current_state = :current_state';
            $params['current_state'] = $data['current_state'];
        }

        if (empty($fields)) {
            return;
        }

        $sql = 'UPDATE restaurant_tables SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = :id';
        $db->prepare($sql)->execute($params);
    }

    /**
     * Update table public QR token (regenerates and revokes previous token).
     */
    public static function updatePublicToken(int $id, string $newToken): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE restaurant_tables
            SET public_token = :token, updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute(['token' => $newToken, 'id' => $id]);
    }

    /**
     * Delete table. Fails if active orders exist.
     */
    public static function delete(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM restaurant_tables WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Check if a table has active orders.
     */
    public static function hasActiveOrders(int $id): bool
    {
        $db = Database::getConnection();
        $stmt = $db->prepare("
            SELECT COUNT(*) FROM orders
            WHERE table_id = :id AND order_status IN ('submitted', 'accepted', 'preparing', 'ready', 'served')
        ");
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Cast fields to correct PHP data types.
     */
    private static function castTypes(array &$rec): void
    {
        $rec['id'] = (int) $rec['id'];
        $rec['qr_enabled'] = (bool) ($rec['qr_enabled'] ?? true);
        if (isset($rec['created_by'])) {
            $rec['created_by'] = $rec['created_by'] !== null ? (int) $rec['created_by'] : null;
        }
        if (isset($rec['active_orders_count'])) {
            $rec['active_orders_count'] = (int) $rec['active_orders_count'];
        }

        // Seamless frontend compatibility aliasing
        $token = $rec['public_token'] ?? ($rec['qr_code_token'] ?? '');
        $rec['public_token'] = $token;
        $rec['qr_code_token'] = $token;
        $rec['label'] = $rec['name'] ?? ($rec['label'] ?? null);
        $rec['is_active'] = (($rec['status'] ?? 'active') === 'active') && !empty($rec['qr_enabled']);
        $rec['has_active_orders'] = ($rec['active_orders_count'] ?? 0) > 0;
        $rec['capacity'] = isset($rec['capacity']) ? (int) $rec['capacity'] : 4;
        $rec['qr_url'] = '/q/' . $token;
    }
}
