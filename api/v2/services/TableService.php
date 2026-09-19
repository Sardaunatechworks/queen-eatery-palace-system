<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Table Service
 *
 * Handles table management business logic, cryptographic QR token generation,
 * revocation, validation, and safe public metadata resolution.
 */

declare(strict_types=1);

namespace App\Services;

use App\Repositories\TableRepository;
use App\Services\AuditService;

class TableService
{
    /**
     * Generate an unpredictable, cryptographically secure 8-character token.
     * Uses uppercase alphanumeric characters excluding ambiguous 0/O, 1/I.
     */
    public static function generateSecureToken(): string
    {
        $chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        $len = strlen($chars);
        $token = '';
        $bytes = random_bytes(8);
        for ($i = 0; $i < 8; $i++) {
            $token .= $chars[ord($bytes[$i]) % $len];
        }
        return $token;
    }

    /**
     * List all tables for admin.
     */
    public function listTables(array $filters = []): array
    {
        return TableRepository::list($filters);
    }

    /**
     * Get table details by ID.
     */
    public function getTable(int $id): ?array
    {
        return TableRepository::findById($id);
    }

    /**
     * Create a new table.
     */
    public function createTable(array $input, int $adminUserId): array
    {
        $tableNumber = trim((string) ($input['table_number'] ?? ''));
        if (empty($tableNumber)) {
            return ['success' => false, 'message' => 'Table number or identifier is required'];
        }

        // Check if table number already exists
        if (TableRepository::findByTableNumber($tableNumber)) {
            return ['success' => false, 'message' => "A table with number '{$tableNumber}' already exists"];
        }

        // Generate unique token
        $token = self::generateSecureToken();
        while (TableRepository::findByPublicToken($token)) {
            $token = self::generateSecureToken();
        }

        $id = TableRepository::create([
            'table_number'  => $tableNumber,
            'name'          => !empty($input['name']) ? trim((string) $input['name']) : null,
            'public_token'  => $token,
            'status'        => $input['status'] ?? 'active',
            'qr_enabled'    => isset($input['qr_enabled']) ? (int) $input['qr_enabled'] : 1,
            'current_state' => $input['current_state'] ?? 'available',
            'created_by'    => $adminUserId,
        ]);

        try {
            AuditService::create($adminUserId, 'table.create', 'restaurant_tables', $id, "Created table '{$tableNumber}' with token {$token}");
        } catch (\Throwable $e) {}

        return [
            'success' => true,
            'message' => "Table '{$tableNumber}' created successfully",
            'data'    => TableRepository::findById($id),
        ];
    }

    /**
     * Update an existing table.
     */
    public function updateTable(int $id, array $input, int $adminUserId): array
    {
        $table = TableRepository::findById($id);
        if (!$table) {
            return ['success' => false, 'message' => 'Table not found', 'code' => 404];
        }

        if (!empty($input['table_number'])) {
            $existing = TableRepository::findByTableNumber(trim((string) $input['table_number']));
            if ($existing && $existing['id'] !== $id) {
                return ['success' => false, 'message' => "Table number '{$input['table_number']}' already in use"];
            }
        }

        TableRepository::update($id, $input);

        try {
            AuditService::create($adminUserId, 'table.update', 'restaurant_tables', $id, "Updated table '{$table['table_number']}'");
        } catch (\Throwable $e) {}

        return [
            'success' => true,
            'message' => 'Table updated successfully',
            'data'    => TableRepository::findById($id),
        ];
    }

    /**
     * Regenerate public QR token for a table.
     * Revokes old QR immediately.
     */
    public function regenerateToken(int $id, int $adminUserId): array
    {
        $table = TableRepository::findById($id);
        if (!$table) {
            return ['success' => false, 'message' => 'Table not found', 'code' => 404];
        }

        $newToken = self::generateSecureToken();
        while (TableRepository::findByPublicToken($newToken)) {
            $newToken = self::generateSecureToken();
        }

        TableRepository::updatePublicToken($id, $newToken);

        try {
            AuditService::create(
                $adminUserId,
                'table.regenerate_qr',
                'restaurant_tables',
                $id,
                "Regenerated QR token for table '{$table['table_number']}'. Old token revoked."
            );
        } catch (\Throwable $e) {}

        return [
            'success' => true,
            'message' => 'QR token regenerated successfully. Old link has been revoked.',
            'data'    => [
                'id'           => $id,
                'table_number' => $table['table_number'],
                'public_token' => $newToken,
            ],
        ];
    }

    /**
     * Delete a table if no active orders are linked to it.
     */
    public function deleteTable(int $id, int $adminUserId): array
    {
        $table = TableRepository::findById($id);
        if (!$table) {
            return ['success' => false, 'message' => 'Table not found', 'code' => 404];
        }

        if (TableRepository::hasActiveOrders($id)) {
            return [
                'success' => false,
                'message' => "Cannot delete '{$table['table_number']}' because it has active/uncompleted orders.",
                'code'    => 400,
            ];
        }

        TableRepository::delete($id);

        try {
            AuditService::create($adminUserId, 'table.delete', 'restaurant_tables', $id, "Deleted table '{$table['table_number']}'");
        } catch (\Throwable $e) {}

        return [
            'success' => true,
            'message' => "Table '{$table['table_number']}' deleted successfully",
        ];
    }

    /**
     * Validate public QR token and return sanitized public metadata.
     * Does NOT expose internal table ID, permissions, notes, or database structures.
     */
    public function validatePublicToken(string $token): array
    {
        $cleanToken = trim($token);
        if (empty($cleanToken) || strlen($cleanToken) > 64) {
            return [
                'success' => false,
                'message' => 'This table ordering link is no longer active. Please ask a staff member for assistance.',
                'code'    => 404,
            ];
        }

        $table = TableRepository::findByPublicToken($cleanToken);
        if (!$table) {
            return [
                'success' => false,
                'message' => 'This table ordering link is no longer active. Please ask a staff member for assistance.',
                'code'    => 404,
            ];
        }

        if ($table['status'] !== 'active' || !$table['qr_enabled']) {
            return [
                'success' => false,
                'message' => 'Table ordering is currently paused for this table. Please ask a staff member for assistance.',
                'code'    => 403,
            ];
        }

        return [
            'success' => true,
            'data'    => [
                'table_number'     => $table['table_number'],
                'name'             => $table['name'] ?? null,
                'ordering_enabled' => true,
            ],
        ];
    }
}
