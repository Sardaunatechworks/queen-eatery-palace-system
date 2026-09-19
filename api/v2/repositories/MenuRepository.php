<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Menu Repository
 *
 * All menu-item-related SQL queries live here.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class MenuRepository
{
    /**
     * List menu items with pagination and optional filters (staff view).
     */
    public static function list(
        int $page = 1,
        int $perPage = DEFAULT_PAGE_SIZE,
        ?string $search = null,
        ?int $categoryId = null,
        ?string $status = null,
        ?string $approvalStatus = null
    ): array {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;
        $where = [];
        $params = [];

        if ($search) {
            $where[] = '(m.name LIKE :search OR m.description LIKE :search2)';
            $params['search']  = "%{$search}%";
            $params['search2'] = "%{$search}%";
        }

        if ($categoryId !== null) {
            $where[] = 'm.category_id = :category_id';
            $params['category_id'] = $categoryId;
        }

        if ($status) {
            $where[] = 'm.status = :status';
            $params['status'] = $status;
        }

        if ($approvalStatus) {
            $where[] = 'm.approval_status = :approval_status';
            $params['approval_status'] = $approvalStatus;
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        // Count
        $countSql = "SELECT COUNT(m.id) FROM menu_items m {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $orderBy = ($approvalStatus === 'pending') ? 'm.created_at DESC' : 'c.name ASC, m.name ASC';
        $sql = "
            SELECT m.id, m.name, m.description, m.category_id, m.price, m.image_path,
                   m.quantity_available, m.track_inventory, m.unit_of_measure,
                   m.status, m.approval_status, m.requires_packaging,
                   m.created_by, m.approved_by, m.created_at, m.updated_at,
                   c.name AS category_name,
                   u.full_name AS creator_name,
                   a.full_name AS approver_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            LEFT JOIN users u ON m.created_by = u.id
            LEFT JOIN users a ON m.approved_by = a.id
            {$whereClause}
            ORDER BY {$orderBy}
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue(":{$key}", $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll();

        // Cast types
        foreach ($items as &$item) {
            self::castTypes($item);
        }

        return ['data' => $items, 'total' => $total];
    }

    /**
     * List public menu items (approved + non-disabled only).
     */
    public static function listPublic(
        int $page = 1,
        int $perPage = DEFAULT_PAGE_SIZE,
        ?string $search = null,
        ?int $categoryId = null
    ): array {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;
        $where = ["m.status != 'disabled'", "m.approval_status = 'approved'"];
        $params = [];

        if ($search) {
            $where[] = '(m.name LIKE :search OR m.description LIKE :search2)';
            $params['search']  = "%{$search}%";
            $params['search2'] = "%{$search}%";
        }

        if ($categoryId !== null) {
            $where[] = 'm.category_id = :category_id';
            $params['category_id'] = $categoryId;
        }

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        // Count
        $countSql = "SELECT COUNT(m.id) FROM menu_items m {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $sql = "
            SELECT m.id, m.name, m.description, m.category_id, m.price, m.image_path,
                   m.quantity_available, m.track_inventory, m.unit_of_measure,
                   m.status, m.approval_status, m.requires_packaging,
                   m.created_at, m.updated_at,
                   c.name AS category_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            {$whereClause}
            ORDER BY c.name ASC, m.name ASC
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue(":{$key}", $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll();

        foreach ($items as &$item) {
            self::castTypes($item);
        }

        return ['data' => $items, 'total' => $total];
    }

    /**
     * Find a single menu item by ID with category join.
     */
    public static function findById(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT m.*, c.name AS category_name,
                   u.full_name AS creator_name,
                   a.full_name AS approver_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            LEFT JOIN users u ON m.created_by = u.id
            LEFT JOIN users a ON m.approved_by = a.id
            WHERE m.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            return null;
        }

        self::castTypes($item);
        return $item;
    }

    /**
     * Find a single menu item by ID with row lock (FOR UPDATE).
     */
    public static function findByIdForUpdate(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT m.*, c.name AS category_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE m.id = :id
            LIMIT 1
            FOR UPDATE
        ');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            return null;
        }

        self::castTypes($item);
        return $item;
    }

    /**
     * Create a new menu item. Returns the new ID.
     */
    public static function create(array $data): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO menu_items
                (name, description, category_id, price, quantity_available, track_inventory, unit_of_measure, status, approval_status, requires_packaging, image_path, created_by, approved_by)
            VALUES
                (:name, :description, :category_id, :price, :qty, :track_inv, :uom, :status, :approval_status, :requires_packaging, :image_path, :created_by, :approved_by)
        ');
        $stmt->execute([
            'name'               => $data['name'],
            'description'        => $data['description'] ?? null,
            'category_id'        => $data['category_id'],
            'price'              => $data['price'],
            'qty'                => $data['quantity_available'] ?? 0,
            'track_inv'          => isset($data['track_inventory']) ? (int) (bool) $data['track_inventory'] : 1,
            'uom'                => $data['unit_of_measure'] ?? 'portion',
            'status'             => $data['status'] ?? 'available',
            'approval_status'    => $data['approval_status'] ?? 'approved',
            'requires_packaging' => isset($data['requires_packaging']) ? (int) (bool) $data['requires_packaging'] : 1,
            'image_path'         => $data['image_path'] ?? null,
            'created_by'         => $data['created_by'] ?? null,
            'approved_by'        => $data['approved_by'] ?? null,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Update a menu item.
     */
    public static function update(int $id, array $data): void
    {
        $db = Database::getConnection();
        $fields = [];
        $params = ['id' => $id];

        $allowed = [
            'name', 'description', 'category_id', 'price',
            'quantity_available', 'track_inventory', 'unit_of_measure',
            'status', 'approval_status',
            'approved_by', 'image_path', 'requires_packaging',
        ];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $fields[] = "`{$field}` = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if (empty($fields)) {
            return;
        }

        $sql = 'UPDATE menu_items SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Delete a menu item (cascade removes inventory + stock_movements).
     */
    public static function delete(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM menu_items WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Update approval status and auto-adjust operational item status.
     */
    public static function updateApproval(int $id, string $status, int $approvedBy): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE menu_items
            SET approval_status = :status,
                status = CASE 
                    WHEN :status_cond = "approved" AND quantity_available > 0 THEN "available"
                    WHEN :status_cond2 = "approved" AND quantity_available <= 0 THEN "out_of_stock"
                    ELSE "disabled"
                END,
                approved_by = :approved_by,
                updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute([
            'status'        => $status,
            'status_cond'   => $status,
            'status_cond2'  => $status,
            'approved_by'   => $approvedBy,
            'id'            => $id,
        ]);
    }

    /**
     * Update image path for a menu item.
     */
    public static function updateImagePath(int $id, string $path): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('UPDATE menu_items SET image_path = :path WHERE id = :id');
        $stmt->execute(['path' => $path, 'id' => $id]);
    }

    /**
     * Get the image path of a menu item.
     */
    public static function getImagePath(int $id): ?string
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT image_path FROM menu_items WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ? ($row['image_path'] ?? null) : null;
    }

    /**
     * Cast result row types to expected PHP types.
     */
    private static function castTypes(array &$item): void
    {
        $item['id']                 = (int) $item['id'];
        $item['price']              = (float) $item['price'];
        $item['quantity_available'] = (float) $item['quantity_available'];
        $item['category_id']        = $item['category_id'] !== null ? (int) $item['category_id'] : null;
        $item['created_by']         = isset($item['created_by']) && $item['created_by'] !== null ? (int) $item['created_by'] : null;
        $item['approved_by']        = isset($item['approved_by']) && $item['approved_by'] !== null ? (int) $item['approved_by'] : null;
        $item['requires_packaging'] = isset($item['requires_packaging']) ? (bool) $item['requires_packaging'] : true;

        if (isset($item['track_inventory'])) {
            $item['track_inventory'] = (bool) $item['track_inventory'];
        }
    }
}
