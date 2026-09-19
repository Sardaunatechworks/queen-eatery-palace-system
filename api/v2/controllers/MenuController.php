<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Menu Controller
 *
 * Thin controller delegating all business logic to MenuService.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Services\MenuService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class MenuController
{
    private MenuService $menuService;

    public function __construct()
    {
        $this->menuService = new MenuService();
    }

    /**
     * GET /api/v2/menu — List menu items.
     * Staff sees all; guests/customers see approved only.
     */
    public function index(): void
    {
        AuthMiddleware::optional();
        $user = $_REQUEST['auth_user'] ?? null;

        $isStaff = $user && in_array(
            $user['role_name'],
            [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN],
            true
        );

        $params = $_GET;

        if ($isStaff) {
            $result = $this->menuService->listItems($params);
        } else {
            $result = $this->menuService->listPublicItems($params);
        }

        $page    = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($_GET['per_page'] ?? DEFAULT_PAGE_SIZE)));

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * GET /api/v2/menu/{id} — Get a single menu item.
     */
    public function show(int $id): void
    {
        $item = $this->menuService->getItem($id);

        if (!$item) {
            Response::notFound('Menu item not found');
        }

        Response::success($item);
    }

    /**
     * POST /api/v2/menu — Create a new menu item.
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.create');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name', 'Item name')
                  ->minLength($input, 'name', 2, 'Item name')
                  ->maxLength($input, 'name', 200, 'Item name')
                  ->required($input, 'price', 'Price')
                  ->numeric($input, 'price', 'Price')
                  ->required($input, 'category_id', 'Category');

        if (isset($input['quantity_available'])) {
            $validator->numeric($input, 'quantity_available', 'Stock quantity');
        }

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        // Default quantity to 0 if not provided
        if (!isset($input['quantity_available'])) {
            $input['quantity_available'] = 0;
        }

        $authUser = $_REQUEST['auth_user'];
        $result = $this->menuService->createItem($input, $authUser);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        Response::created($result['data'], $result['message']);
    }

    /**
     * PUT /api/v2/menu/{id} — Update a menu item.
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.edit');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name', 'Item name')
                  ->minLength($input, 'name', 2, 'Item name')
                  ->required($input, 'price', 'Price')
                  ->numeric($input, 'price', 'Price')
                  ->required($input, 'category_id', 'Category');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $authUser = $_REQUEST['auth_user'];
        $result = $this->menuService->updateItem($id, $input, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * DELETE /api/v2/menu/{id} — Delete a menu item.
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.delete');

        $authUser = $_REQUEST['auth_user'];
        $result = $this->menuService->deleteItem($id, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success(null, $result['message']);
    }

    /**
     * PATCH /api/v2/menu/{id}/approve — Approve or reject a menu item.
     */
    public function approve(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.approve');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'approval_status', 'Approval status')
                  ->inArray($input, 'approval_status', [APPROVAL_APPROVED, APPROVAL_REJECTED]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $authUser = $_REQUEST['auth_user'];
        $result = $this->menuService->approveItem($id, $input['approval_status'], $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success(null, $result['message']);
    }

    /**
     * PATCH /api/v2/menu/{id}/stock — Quick stock update.
     */
    public function updateStock(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('inventory.adjust', 'inventory.stock_in', 'manageInventory');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity', 'Quantity')
                  ->numeric($input, 'quantity', 'Quantity')
                  ->required($input, 'movement_type', 'Movement type')
                  ->inArray($input, 'movement_type', ['add', 'deduction', 'adjustment', 'stock_in', 'manual_adjust']);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $authUser = $_REQUEST['auth_user'];
        $result = $this->menuService->updateStock($id, $input, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * POST /api/v2/menu/{id}/image — Upload menu item image.
     */
    public function uploadImage(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.edit');

        if (empty($_FILES['image'])) {
            Response::error('No image file uploaded', 400);
        }

        $result = $this->menuService->uploadImage($id, $_FILES['image']);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success($result['data'], $result['message']);
    }
}
