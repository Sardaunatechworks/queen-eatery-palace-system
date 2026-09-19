<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Event Hall Repository
 *
 * Data access layer for event hall inquiries, bookings, scheduling,
 * and slot collision detection.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class EventHallRepository
{
    /**
     * Self-healing migration: Ensure start_time and end_time columns exist in event_hall_inquiries.
     */
    public static function ensureColumns(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        try {
            $db = Database::getConnection();
            $cols = $db->query("SHOW COLUMNS FROM event_hall_inquiries LIKE 'start_time'")->fetchAll();
            if (empty($cols)) {
                $db->exec("ALTER TABLE event_hall_inquiries ADD COLUMN `start_time` TIME NULL AFTER `preferred_date`");
            }
            $colsEnd = $db->query("SHOW COLUMNS FROM event_hall_inquiries LIKE 'end_time'")->fetchAll();
            if (empty($colsEnd)) {
                $db->exec("ALTER TABLE event_hall_inquiries ADD COLUMN `end_time` TIME NULL AFTER `start_time`");
            }
        } catch (\Throwable $e) {
            // Ignore if columns already exist or permission boundary
        }

        $ensured = true;
    }

    /**
     * Create a new event hall inquiry / reservation.
     */
    public static function create(array $data): int
    {
        self::ensureColumns();
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO event_hall_inquiries (
                full_name, phone, email, event_type, 
                preferred_date, start_time, end_time, expected_guests, message, status
            ) VALUES (
                :name, :phone, :email, :type, 
                :date, :start_time, :end_time, :guests, :msg, "new"
            )
        ');

        $stmt->execute([
            'name'       => $data['full_name'],
            'phone'      => $data['phone'],
            'email'      => $data['email'] ?? null,
            'type'       => $data['event_type'],
            'date'       => $data['preferred_date'],
            'start_time' => !empty($data['start_time']) ? $data['start_time'] : null,
            'end_time'   => !empty($data['end_time']) ? $data['end_time'] : null,
            'guests'     => $data['expected_guests'] ?? null,
            'msg'        => $data['message'] ?? null,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * List inquiries with optional filters and pagination.
     */
    public static function list(array $filters = [], int $limit = 20, int $offset = 0): array
    {
        self::ensureColumns();
        $db = Database::getConnection();

        $where = ['1=1'];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'e.status = :status';
            $params['status'] = $filters['status'];
        }

        if (!empty($filters['event_type'])) {
            $where[] = 'e.event_type = :event_type';
            $params['event_type'] = $filters['event_type'];
        }

        if (!empty($filters['start_date'])) {
            $where[] = 'e.preferred_date >= :start_date';
            $params['start_date'] = $filters['start_date'];
        }

        if (!empty($filters['end_date'])) {
            $where[] = 'e.preferred_date <= :end_date';
            $params['end_date'] = $filters['end_date'];
        }

        if (!empty($filters['search'])) {
            $where[] = '(e.full_name LIKE :search OR e.phone LIKE :search OR e.email LIKE :search)';
            $params['search'] = '%' . $filters['search'] . '%';
        }

        $whereClause = implode(' AND ', $where);

        // Count total
        $countStmt = $db->prepare("SELECT COUNT(e.id) FROM event_hall_inquiries e WHERE {$whereClause}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Fetch records
        $sql = "
            SELECT 
                e.id, e.full_name, e.phone, e.email, e.event_type,
                e.preferred_date, e.start_time, e.end_time, e.expected_guests, e.message, e.status,
                e.admin_notes, e.handled_by, e.created_at, e.updated_at,
                u.full_name AS handler_name
            FROM event_hall_inquiries e
            LEFT JOIN users u ON e.handled_by = u.id
            WHERE {$whereClause}
            ORDER BY e.preferred_date DESC, e.start_time ASC, e.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll();

        return [
            'data' => array_map(function ($r) {
                return [
                    'id'              => (int) $r['id'],
                    'full_name'       => $r['full_name'],
                    'phone'           => $r['phone'],
                    'email'           => $r['email'],
                    'event_type'      => $r['event_type'],
                    'preferred_date'  => $r['preferred_date'],
                    'start_time'      => $r['start_time'] ? substr((string) $r['start_time'], 0, 5) : null,
                    'end_time'        => $r['end_time'] ? substr((string) $r['end_time'], 0, 5) : null,
                    'expected_guests' => $r['expected_guests'] !== null ? (int) $r['expected_guests'] : null,
                    'message'         => $r['message'],
                    'status'          => $r['status'],
                    'admin_notes'     => $r['admin_notes'],
                    'handled_by'      => $r['handled_by'] !== null ? (int) $r['handled_by'] : null,
                    'handler_name'    => $r['handler_name'],
                    'created_at'      => $r['created_at'],
                    'updated_at'      => $r['updated_at'],
                ];
            }, $rows),
            'total' => $total,
        ];
    }

    /**
     * Find inquiry by ID.
     */
    public static function findById(int $id): ?array
    {
        self::ensureColumns();
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT 
                e.id, e.full_name, e.phone, e.email, e.event_type,
                e.preferred_date, e.start_time, e.end_time, e.expected_guests, e.message, e.status,
                e.admin_notes, e.handled_by, e.created_at, e.updated_at,
                u.full_name AS handler_name
            FROM event_hall_inquiries e
            LEFT JOIN users u ON e.handled_by = u.id
            WHERE e.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $r = $stmt->fetch();

        if (!$r) {
            return null;
        }

        return [
            'id'              => (int) $r['id'],
            'full_name'       => $r['full_name'],
            'phone'           => $r['phone'],
            'email'           => $r['email'],
            'event_type'      => $r['event_type'],
            'preferred_date'  => $r['preferred_date'],
            'start_time'      => $r['start_time'] ? substr((string) $r['start_time'], 0, 5) : null,
            'end_time'        => $r['end_time'] ? substr((string) $r['end_time'], 0, 5) : null,
            'expected_guests' => $r['expected_guests'] !== null ? (int) $r['expected_guests'] : null,
            'message'         => $r['message'],
            'status'          => $r['status'],
            'admin_notes'     => $r['admin_notes'],
            'handled_by'      => $r['handled_by'] !== null ? (int) $r['handled_by'] : null,
            'handler_name'    => $r['handler_name'],
            'created_at'      => $r['created_at'],
            'updated_at'      => $r['updated_at'],
        ];
    }

    /**
     * Fetch all active bookings for a specific date.
     */
    public static function getBookingsForDate(string $date, ?int $excludeId = null): array
    {
        self::ensureColumns();
        $db = Database::getConnection();

        $sql = "
            SELECT id, full_name, event_type, preferred_date, start_time, end_time, status
            FROM event_hall_inquiries
            WHERE preferred_date = :date
              AND status IN ('confirmed', 'new', 'contacted')
        ";
        $params = ['date' => $date];

        if ($excludeId !== null) {
            $sql .= " AND id != :exclude_id";
            $params['exclude_id'] = $excludeId;
        }

        $sql .= " ORDER BY start_time ASC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        return array_map(function ($r) {
            return [
                'id'             => (int) $r['id'],
                'event_type'     => $r['event_type'],
                'preferred_date' => $r['preferred_date'],
                'start_time'     => $r['start_time'] ? substr((string) $r['start_time'], 0, 5) : null,
                'end_time'       => $r['end_time'] ? substr((string) $r['end_time'], 0, 5) : null,
                'status'         => $r['status'],
            ];
        }, $rows);
    }

    /**
     * Check if a proposed time slot conflicts with an existing booking.
     * Overlap condition between [S1, E1] and [S2, E2]:
     * S1 < E2 AND E1 > S2.
     * Also conflicts if an existing booking has NULL start_time (full-day lock).
     *
     * @return array|null Returns the conflicting booking row if conflict exists, or null if free.
     */
    public static function hasTimeConflict(string $date, string $startTime, string $endTime, ?int $excludeId = null): ?array
    {
        self::ensureColumns();
        $bookings = self::getBookingsForDate($date, $excludeId);

        // Normalize requested times to seconds for accurate comparison
        $reqStart = self::timeToSeconds($startTime);
        $reqEnd = self::timeToSeconds($endTime);

        foreach ($bookings as $b) {
            // If existing booking has no specified times, it reserves the entire day
            if (empty($b['start_time']) || empty($b['end_time'])) {
                return $b;
            }

            $bStart = self::timeToSeconds($b['start_time']);
            $bEnd = self::timeToSeconds($b['end_time']);

            // Overlap check: reqStart < bEnd && reqEnd > bStart
            if ($reqStart < $bEnd && $reqEnd > $bStart) {
                return $b;
            }
        }

        return null;
    }

    /**
     * Convert HH:MM or HH:MM:SS string to seconds past midnight.
     */
    private static function timeToSeconds(string $timeStr): int
    {
        $parts = explode(':', trim($timeStr));
        $h = (int) ($parts[0] ?? 0);
        $m = (int) ($parts[1] ?? 0);
        $s = (int) ($parts[2] ?? 0);
        return ($h * 3600) + ($m * 60) + $s;
    }

    /**
     * Update inquiry status and admin notes.
     */
    public static function updateStatus(int $id, string $status, ?string $adminNotes = null, ?int $handledBy = null): bool
    {
        self::ensureColumns();
        $db = Database::getConnection();

        $fields = ['status = :status'];
        $params = ['id' => $id, 'status' => $status];

        if ($adminNotes !== null) {
            $fields[] = 'admin_notes = :notes';
            $params['notes'] = $adminNotes;
        }

        if ($handledBy !== null) {
            $fields[] = 'handled_by = :handler';
            $params['handler'] = $handledBy;
        }

        $setClause = implode(', ', $fields);
        $stmt = $db->prepare("UPDATE event_hall_inquiries SET {$setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = :id");

        return $stmt->execute($params);
    }

    /**
     * Get aggregate inquiry statistics.
     */
    public static function getStats(): array
    {
        self::ensureColumns();
        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT 
                COUNT(id) AS total,
                COUNT(CASE WHEN status = "new" THEN 1 END) AS count_new,
                COUNT(CASE WHEN status = "contacted" THEN 1 END) AS count_contacted,
                COUNT(CASE WHEN status = "confirmed" THEN 1 END) AS count_confirmed,
                COUNT(CASE WHEN status = "declined" THEN 1 END) AS count_declined,
                COUNT(CASE WHEN status = "completed" THEN 1 END) AS count_completed
            FROM event_hall_inquiries
        ');
        $row = $stmt->fetch() ?: [];

        return [
            'total'     => (int) ($row['total'] ?? 0),
            'new'       => (int) ($row['count_new'] ?? 0),
            'contacted' => (int) ($row['count_contacted'] ?? 0),
            'confirmed' => (int) ($row['count_confirmed'] ?? 0),
            'declined'  => (int) ($row['count_declined'] ?? 0),
            'completed' => (int) ($row['count_completed'] ?? 0),
        ];
    }

    /**
     * Delete an inquiry.
     */
    public static function delete(int $id): bool
    {
        self::ensureColumns();
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM event_hall_inquiries WHERE id = :id');
        return $stmt->execute(['id' => $id]);
    }
}
