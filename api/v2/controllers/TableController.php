<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Table Controller
 *
 * REST endpoints for managing restaurant tables and QR tokens.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\TableService;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class TableController
{
    private TableService $tableService;

    public function __construct()
    {
        $this->tableService = new TableService();
    }

    /**
     * GET /api/v2/tables
     * List all tables. Available to Admin, Super Admin, and Cashiers.
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $filters = [
            'search'     => $_GET['search'] ?? null,
            'status'     => $_GET['status'] ?? null,
            'qr_enabled' => isset($_GET['qr_enabled']) ? (int) $_GET['qr_enabled'] : null,
        ];

        $tables = $this->tableService->listTables($filters);
        Response::success($tables);
    }

    /**
     * GET /api/v2/tables/{id}
     * Retrieve single table.
     */
    public function show(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $table = $this->tableService->getTable($id);
        if (!$table) {
            Response::notFound('Table not found');
            return;
        }

        Response::success($table);
    }

    /**
     * POST /api/v2/tables
     * Create new table. Admin only.
     */
    public function store(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN]);
        $user = $_REQUEST['auth_user'];

        $input = $_REQUEST['json_input'] ?? [];

        $validator = Validator::make($input, [
            'table_number' => 'required|min:1|max:50',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
            return;
        }

        $result = $this->tableService->createTable($input, (int) $user['id']);
        if (!$result['success']) {
            Response::error($result['message'], 400);
            return;
        }

        Response::created($result['data'], $result['message']);
    }

    /**
     * PATCH /api/v2/tables/{id}
     * Update table details. Admin only.
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN]);
        $user = $_REQUEST['auth_user'];

        $input = $_REQUEST['json_input'] ?? [];
        $result = $this->tableService->updateTable($id, $input, (int) $user['id']);

        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 400);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * POST /api/v2/tables/{id}/regenerate-qr
     * Revoke old token and generate new secure public QR token. Admin only.
     */
    public function regenerateQr(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN]);
        $user = $_REQUEST['auth_user'];

        $result = $this->tableService->regenerateToken($id, (int) $user['id']);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 400);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * GET /api/v2/tables/{id}/qr
     * Get QR code URL and metadata for printing table card.
     */
    public function qrData(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $table = $this->tableService->getTable($id);
        if (!$table) {
            Response::notFound('Table not found');
            return;
        }

        // Build absolute QR order URL
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost:3000';
        $qrUrl = $protocol . $host . '/q/' . $table['public_token'];

        Response::success([
            'table_id'     => $table['id'],
            'table_number' => $table['table_number'],
            'name'         => $table['name'],
            'public_token' => $table['public_token'],
            'qr_url'       => $qrUrl,
            'qr_enabled'   => (bool) $table['qr_enabled'],
            'status'       => $table['status'],
        ]);
    }

    /**
     * DELETE /api/v2/tables/{id}
     * Delete table if no active orders exist. Admin only.
     */
    public function destroy(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN]);
        $user = $_REQUEST['auth_user'];

        $result = $this->tableService->deleteTable($id, (int) $user['id']);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 400);
            return;
        }

        Response::success([], $result['message']);
    }
}
