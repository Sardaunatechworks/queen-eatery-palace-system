<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Audit Repository
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class AuditRepository
{
    /**
     * Insert an audit log entry.
     */
    public static function create(
        ?int $userId,
        ?string $userName,
        string $action,
        ?string $entityType,
        ?string $entityId,
        ?string $description,
        ?array $oldValues,
        ?array $newValues,
        ?string $ipAddress
    ): void {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, ip_address)
            VALUES (:uid, :action, :etype, :eid, :desc, :ip)
        ');
        $fullDesc = $description;
        if ($userName && !str_contains($description ?? '', $userName)) {
            $fullDesc = ($description ? "{$description} " : '') . "[User: {$userName}]";
        }
        $stmt->execute([
            'uid'      => $userId,
            'action'   => $action,
            'etype'    => $entityType,
            'eid'      => $entityId,
            'desc'     => $fullDesc,
            'ip'       => $ipAddress,
        ]);
    }

    /**
     * List audit logs with pagination.
     */
    public static function list(
        int $page = 1,
        int $perPage = DEFAULT_PAGE_SIZE,
        ?string $action = null,
        ?string $entityType = null,
        ?int $userId = null
    ): array {
        $db = Database::getConnection();
        $offset = ($page - 1) * $perPage;
        $where = [];
        $params = [];

        if ($action) {
            $where[] = 'action LIKE :action';
            $params['action'] = "%{$action}%";
        }

        if ($entityType) {
            $where[] = 'entity_type = :etype';
            $params['etype'] = $entityType;
        }

        if ($userId) {
            $where[] = 'user_id = :uid';
            $params['uid'] = $userId;
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        // Count
        $countStmt = $db->prepare("SELECT COUNT(id) FROM audit_logs {$whereClause}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch
        $sql = "SELECT * FROM audit_logs {$whereClause} ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue(":{$key}", $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['data' => $stmt->fetchAll(), 'total' => $total];
    }
}
