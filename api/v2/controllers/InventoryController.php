<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Inventory Controller
 *
 * Dedicated controller for inventory management.
 * Delegates all mutations to InventoryService.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\InventoryService;
use App\Repositories\InventoryRepository;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class InventoryController
{
    /**
     * GET /api/v2/inventory — List all inventory records.
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.view', 'manageInventory');

        $records = InventoryRepository::listAll();
        Response::success($records);
    }

    /**
     * GET /api/v2/inventory/summary — KPI statistics.
     */
    public function summary(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.view', 'manageInventory');

        $stats = InventoryRepository::getSummaryStats();
        Response::success($stats);
    }

    /**
     * GET /api/v2/inventory/movements — Recent stock movements across all items.
     */
    public function movements(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.view', 'manageInventory');

        $limit = min(200, max(1, (int) ($_GET['limit'] ?? 100)));
        $movements = InventoryRepository::getAllStockMovements($limit);
        Response::success($movements);
    }

    /**
     * GET /api/v2/inventory/low-stock — Get items at or below threshold.
     */
    public function lowStock(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.view', 'manageInventory');

        $records = InventoryRepository::getLowStock();
        Response::success($records);
    }

    /**
     * GET /api/v2/inventory/{menu_item_id}/history — Stock movement history for one item.
     */
    public function stockHistory(int $menuItemId): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.view', 'manageInventory');

        $limit = min(200, max(1, (int) ($_GET['limit'] ?? 50)));
        $movements = InventoryRepository::getStockHistory($menuItemId, $limit);

        Response::success($movements);
    }

    /**
     * POST /api/v2/inventory/{menu_item_id}/stock-in — Add stock (restock/purchase).
     */
    public function stockIn(int $menuItemId): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.stock_in', 'inventory.adjust', 'manageInventory');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity', 'Quantity')
                  ->numeric($input, 'quantity', 'Quantity');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $quantity = (float) $input['quantity'];
        if ($quantity <= 0) {
            Response::error('Quantity must be greater than zero', 400);
        }

        $notes = Sanitizer::string($input['notes'] ?? 'Restock / Purchase');
        $authUser = $_REQUEST['auth_user'];
        $userId = (int) $authUser['id'];

        $result = InventoryService::stockIn($menuItemId, $quantity, $notes, $userId);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        Response::success($result['data'] ?? null, $result['message']);
    }

    /**
     * POST /api/v2/inventory/{menu_item_id}/wastage — Record wastage, expired, or damaged stock.
     */
    public function recordWastage(int $menuItemId): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.wastage', 'inventory.adjust');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity', 'Quantity')
                  ->numeric($input, 'quantity', 'Quantity')
                  ->required($input, 'notes', 'Reason / Notes');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $quantity = (float) $input['quantity'];
        if ($quantity <= 0) {
            Response::error('Quantity must be greater than zero', 400);
        }

        $notes = Sanitizer::string($input['notes']);
        $type = in_array($input['type'] ?? '', ['wastage', 'damaged'], true) ? $input['type'] : 'wastage';
        $authUser = $_REQUEST['auth_user'];
        $userId = (int) $authUser['id'];

        $result = InventoryService::recordWastage($menuItemId, $quantity, $notes, $userId, $type);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        Response::success($result['data'] ?? null, $result['message']);
    }

    /**
     * POST /api/v2/inventory/{menu_item_id}/adjust — Set absolute quantity.
     */
    public function manualAdjust(int $menuItemId): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.adjust', 'inventory.stock_in', 'manageInventory');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity', 'New quantity')
                  ->numeric($input, 'quantity', 'New quantity')
                  ->required($input, 'notes', 'Reason / Notes');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $quantity = (float) $input['quantity'];
        if ($quantity < 0) {
            Response::error('Quantity cannot be negative', 400);
        }

        $notes = Sanitizer::string($input['notes']);
        $authUser = $_REQUEST['auth_user'];
        $userId = (int) $authUser['id'];

        $result = InventoryService::manualAdjust($menuItemId, $quantity, $notes, $userId);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        // Also check if threshold was supplied in adjust request
        if (isset($input['low_stock_threshold']) && is_numeric($input['low_stock_threshold'])) {
            $thresh = (float) $input['low_stock_threshold'];
            if ($thresh >= 0) {
                InventoryService::updateThreshold($menuItemId, $thresh, $userId);
            }
        }

        Response::success($result['data'] ?? null, $result['message']);
    }

    /**
     * PUT /api/v2/inventory/{menu_item_id} — Legacy update qty & threshold.
     */
    public function update(int $menuItemId): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.adjust', 'manageInventory');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity', 'Quantity')
                  ->numeric($input, 'quantity', 'Quantity')
                  ->required($input, 'low_stock_threshold', 'Low stock threshold')
                  ->numeric($input, 'low_stock_threshold', 'Low stock threshold');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $qty = (float) $input['quantity'];
        $threshold = (float) $input['low_stock_threshold'];

        if ($qty < 0 || $threshold < 0) {
            Response::error('Values cannot be negative', 400);
        }

        $authUser = $_REQUEST['auth_user'];
        $userId = (int) $authUser['id'];
        $notes = Sanitizer::string($input['notes'] ?? 'Updated from Inventory Management');

        $adjustRes = InventoryService::manualAdjust($menuItemId, $qty, $notes, $userId);
        if (!$adjustRes['success']) {
            Response::error($adjustRes['message'], 400);
        }

        InventoryService::updateThreshold($menuItemId, $threshold, $userId);

        Response::success(null, 'Inventory updated successfully');
    }
}
