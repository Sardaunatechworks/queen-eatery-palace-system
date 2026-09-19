<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 User Repository
 *
 * All user-related SQL queries live here.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class UserRepository
{
    /**
     * Find a user by ID with role name.
     */
    public static function findById(int $id): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT u.id, u.full_name, u.email, u.phone, u.address,
                   u.role_id, u.status, u.profile_image,
                   u.last_login_at, u.created_at, u.updated_at,
                   r.name AS role_name, r.display_name AS role_display_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch() ?: null;
        if ($user) {
            $user['name'] = $user['full_name'];
            $user['role'] = $user['role_name'];
            $user['uid'] = (string) $user['id'];
        }
        return $user;
    }

    /**
     * Find a user by ID with full permissions loaded.
     */
    public static function findWithPermissions(int $id): ?array
    {
        $user = self::findById($id);
        if (!$user) {
            return null;
        }

        $user['permissions'] = PermissionRepository::getEffectivePermissions(
            (int) $user['id'],
            (int) $user['role_id']
        );

        return $user;
    }

    /**
     * Find a user by email.
     */
    public static function findByEmail(string $email): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT u.*, r.name AS role_name, r.display_name AS role_display_name
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = :email
            LIMIT 1
        ');
        $stmt->execute(['email' => $email]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Create a new user.
     */
    public static function create(array $data): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO users (full_name, email, phone, address, password_hash, role_id, status)
            VALUES (:name, :email, :phone, :address, :hash, :role_id, :status)
        ');
        $stmt->execute([
            'name'    => $data['full_name'],
            'email'   => $data['email'],
            'phone'   => $data['phone'] ?? null,
            'address' => $data['address'] ?? null,
            'hash'    => $data['password_hash'],
            'role_id' => $data['role_id'],
            'status'  => $data['status'] ?? STATUS_ACTIVE,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Update a user's profile fields.
     */
    public static function update(int $id, array $data): void
    {
        $db = Database::getConnection();
        $fields = [];
        $params = ['id' => $id];

        $allowedFields = ['full_name', 'email', 'phone', 'address', 'profile_image', 'status', 'role_id'];

        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $fields[] = "`{$field}` = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if (empty($fields)) {
            return;
        }

        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Update password hash.
     */
    public static function updatePassword(int $id, string $passwordHash): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->execute(['hash' => $passwordHash, 'id' => $id]);
    }

    /**
     * Update last login timestamp.
     */
    public static function updateLastLogin(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /**
     * Soft-delete a user.
     */
    public static function softDelete(int $id): void
    {
        self::update($id, ['status' => STATUS_DELETED]);
    }

    /**
     * List users with pagination and optional filters.
     */
    public static function list(
        int $page = 1,
        int $perPage = DEFAULT_PAGE_SIZE,
        ?string $role = null,
        ?string $status = null,
        ?string $search = null
    ): array {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;
        $where = [];
        $params = [];

        if ($role) {
            $where[] = 'r.name = :role';
            $params['role'] = $role;
        }

        if ($status) {
            $where[] = 'u.status = :status';
            $params['status'] = $status;
        }

        if ($search) {
            $where[] = '(u.full_name LIKE :search OR u.email LIKE :search2)';
            $params['search'] = "%{$search}%";
            $params['search2'] = "%{$search}%";
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        // Count
        $countSql = "SELECT COUNT(u.id) FROM users u JOIN roles r ON u.role_id = r.id {$whereClause}";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $sql = "
            SELECT u.id, u.full_name, u.email, u.phone, u.status, u.profile_image,
                   u.role_id, u.last_login_at, u.created_at,
                   r.name AS role_name, r.display_name AS role_display_name,
                   s.reason AS suspension_reason, s.end_date AS suspension_end_date
            FROM users u
            JOIN roles r ON u.role_id = r.id
            LEFT JOIN staff_suspensions s ON s.user_id = u.id AND s.id = (
                SELECT MAX(id) FROM staff_suspensions WHERE user_id = u.id
            )
            {$whereClause}
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue(":{$key}", $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll();

        foreach ($users as &$u) {
            $u['name'] = $u['full_name'];
            $u['role'] = $u['role_name'];
            $u['uid'] = (string) $u['id'];
            $u['suspensionReason'] = $u['suspension_reason'] ?? null;
            $u['suspensionEndDate'] = $u['suspension_end_date'] ?? null;
            $u['permissions'] = PermissionRepository::getEffectivePermissions((int) $u['id'], (int) ($u['role_id'] ?? 0));
        }
        unset($u);

        return ['data' => $users, 'total' => $total];
    }

    /**
     * List staff users only (non-customer).
     */
    public static function listStaff(int $page = 1, int $perPage = DEFAULT_PAGE_SIZE, ?string $search = null): array
    {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;
        $params = [];

        $searchClause = '';
        if ($search) {
            $searchClause = 'AND (u.full_name LIKE :search OR u.email LIKE :search2)';
            $params['search'] = "%{$search}%";
            $params['search2'] = "%{$search}%";
        }

        // Count
        $countSql = "SELECT COUNT(u.id) FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name != :cust_role {$searchClause}";
        $countStmt = $db->prepare($countSql);
        $params['cust_role'] = ROLE_CUSTOMER;
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $sql = "
            SELECT u.id, u.full_name, u.email, u.phone, u.status, u.profile_image,
                   u.role_id, u.last_login_at, u.created_at,
                   r.name AS role_name, r.display_name AS role_display_name,
                   s.reason AS suspension_reason, s.end_date AS suspension_end_date
            FROM users u
            JOIN roles r ON u.role_id = r.id
            LEFT JOIN staff_suspensions s ON s.user_id = u.id AND s.id = (
                SELECT MAX(id) FROM staff_suspensions WHERE user_id = u.id
            )
            WHERE r.name != :cust_role2
            {$searchClause}
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':cust_role2', ROLE_CUSTOMER);
        if ($search) {
            $stmt->bindValue(':search', "%{$search}%");
            $stmt->bindValue(':search2', "%{$search}%");
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll();

        foreach ($users as &$u) {
            $u['name'] = $u['full_name'];
            $u['role'] = $u['role_name'];
            $u['uid'] = (string) $u['id'];
            $u['suspensionReason'] = $u['suspension_reason'] ?? null;
            $u['suspensionEndDate'] = $u['suspension_end_date'] ?? null;
            $u['permissions'] = PermissionRepository::getEffectivePermissions((int) $u['id'], (int) ($u['role_id'] ?? 0));
        }
        unset($u);

        return ['data' => $users, 'total' => $total];
    }

    /**
     * Check if an email already exists (optionally excluding a user ID).
     */
    public static function emailExists(string $email, ?int $excludeId = null): bool
    {
        $db = Database::getConnection();
        $sql = 'SELECT COUNT(id) FROM users WHERE email = :email';
        $params = ['email' => $email];

        if ($excludeId) {
            $sql .= ' AND id != :exclude_id';
            $params['exclude_id'] = $excludeId;
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Get the role ID by role name.
     */
    public static function getRoleId(string $roleName): ?int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $stmt->execute(['name' => $roleName]);
        $row = $stmt->fetch();
        return $row ? (int) $row['id'] : null;
    }

    /**
     * Get all roles.
     */
    public static function getAllRoles(): array
    {
        $db = Database::getConnection();
        return $db->query('SELECT id, name, display_name FROM roles ORDER BY id ASC')->fetchAll();
    }
}
