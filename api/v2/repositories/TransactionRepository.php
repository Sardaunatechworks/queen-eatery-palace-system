<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Transaction Repository
 *
 * Encapsulates all data access for transactions / payment records.
 */

declare(strict_types=1);

namespace App\Repositories;

use App\Config\Database;
use PDO;

class TransactionRepository
{
    /**
     * List paginated transactions with optional filters.
     */
    public static function list(int $page, int $perPage, array $filters = []): array
    {
        $db = Database::getConnection();

        $where = ['1=1'];
        $params = [];

        if (!empty($filters['search'])) {
            $where[] = '(t.transaction_reference LIKE :search OR o.order_number LIKE :search OR u.full_name LIKE :search)';
            $params['search'] = '%' . $filters['search'] . '%';
        }

        if (!empty($filters['payment_method'])) {
            $where[] = 't.payment_method = :payment_method';
            $params['payment_method'] = $filters['payment_method'];
        }

        if (!empty($filters['payment_status'])) {
            $where[] = 't.payment_status = :payment_status';
            $params['payment_status'] = $filters['payment_status'];
        }

        if (!empty($filters['date_from'])) {
            $where[] = 't.created_at >= :date_from';
            $params['date_from'] = $filters['date_from'] . ' 00:00:00';
        }

        if (!empty($filters['date_to'])) {
            $where[] = 't.created_at <= :date_to';
            $params['date_to'] = $filters['date_to'] . ' 23:59:59';
        }

        $whereClause = implode(' AND ', $where);

        $countStmt = $db->prepare("
            SELECT COUNT(t.id)
            FROM transactions t
            JOIN orders o ON t.order_id = o.id
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE {$whereClause}
        ");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $stmt = $db->prepare("
            SELECT t.*,
                   o.order_number,
                   o.customer_name AS order_customer_name,
                   u.full_name AS customer_user_name,
                   u.email AS customer_email
            FROM transactions t
            JOIN orders o ON t.order_id = o.id
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE {$whereClause}
            ORDER BY t.created_at DESC
            LIMIT :limit OFFSET :offset
        ");

        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $records = $stmt->fetchAll();
        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return [
            'data'  => $records,
            'total' => $total,
        ];
    }

    /**
     * Find transactions by order ID.
     */
    public static function findByOrderId(int $orderId): array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT * FROM transactions
            WHERE order_id = :oid
            ORDER BY created_at ASC
        ');
        $stmt->execute(['oid' => $orderId]);
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            self::castTypes($rec);
        }

        return $records;
    }

    /**
     * Find transaction by unique reference.
     */
    public static function findByReference(string $reference): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT * FROM transactions
            WHERE transaction_reference = :ref
            LIMIT 1
        ');
        $stmt->execute(['ref' => $reference]);
        $rec = $stmt->fetch();

        if (!$rec) {
            return null;
        }

        self::castTypes($rec);
        return $rec;
    }

    /**
     * Create a new transaction record.
     */
    public static function create(
        int $orderId,
        string $reference,
        float $amount,
        string $paymentMethod,
        string $paymentStatus,
        string $provider = 'paystack',
        ?string $verifiedAt = null
    ): int {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO transactions (
                order_id, transaction_reference, amount, payment_method,
                payment_status, provider, verified_at
            ) VALUES (
                :oid, :ref, :amount, :pmethod, :pstatus, :provider, :verified_at
            )
        ');

        $stmt->execute([
            'oid'         => $orderId,
            'ref'         => $reference,
            'amount'      => $amount,
            'pmethod'     => $paymentMethod,
            'pstatus'     => $paymentStatus,
            'provider'    => $provider,
            'verified_at' => $verifiedAt,
        ]);

        return (int) $db->lastInsertId();
    }

    /**
     * Update transaction status and verified timestamp by reference.
     */
    public static function updateStatus(string $reference, string $status, ?string $verifiedAt = null): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            UPDATE transactions
            SET payment_status = :status, verified_at = COALESCE(:verified_at, verified_at)
            WHERE transaction_reference = :ref
        ');
        $stmt->execute([
            'status'      => $status,
            'verified_at' => $verifiedAt,
            'ref'         => $reference,
        ]);
    }

    /**
     * Type-cast integer and float fields.
     */
    private static function castTypes(array &$rec): void
    {
        $rec['id'] = (int) $rec['id'];
        $rec['order_id'] = (int) $rec['order_id'];
        $rec['amount'] = (float) $rec['amount'];

        // Backward-compatibility keys
        $rec['reference'] = $rec['transaction_reference'];
        $rec['status'] = $rec['payment_status'];
        $rec['customer_name'] = $rec['customer_user_name'] ?? $rec['order_customer_name'] ?? 'Customer';
    }
}
