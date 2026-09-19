<?php
/**
 * Queen Eatery Palace - Menu Controller
 * 
 * Handles menu item details, creation, updates, approval, stock, and image upload.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\FileUploadService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use PDO;

class MenuController
{
    /**
     * List all menu items (with category name)
     * GET /api/menu
     */
    public function index(): void
    {
        AuthMiddleware::optional();
        $user = $_REQUEST['auth_user'] ?? null;
        
        $db = Database::getConnection();
        
        $isStaff = $user && in_array($user['role_name'], [ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN], true);

        if ($isStaff) {
            // Staff sees all items
            $stmt = $db->query('
                SELECT m.*, c.name AS category_name
                FROM menu_items m
                LEFT JOIN categories c ON m.category_id = c.id
                ORDER BY c.name ASC, m.name ASC
            ');
        } else {
            // Customer / Guest sees only approved, non-disabled items
            $stmt = $db->query('
                SELECT m.*, c.name AS category_name
                FROM menu_items m
                LEFT JOIN categories c ON m.category_id = c.id
                WHERE m.status != "disabled" AND m.approval_status = "approved"
                ORDER BY c.name ASC, m.name ASC
            ');
        }
        
        $items = $stmt->fetchAll();

        // Convert columns to types expected by client
        foreach ($items as &$item) {
            $item['id'] = (string)$item['id'];
            $item['price'] = (float)$item['price'];
            $item['quantity_available'] = (int)$item['quantity_available'];
            $item['category_id'] = $item['category_id'] ? (string)$item['category_id'] : null;
            $item['image'] = $item['image_path'] ?? '';
            $item['category'] = $item['category_name'] ?? 'Uncategorized';
            $item['stockQuantity'] = $item['quantity_available'];
            $item['isAvailable'] = $item['status'] !== 'disabled';
            $item['status'] = $item['approval_status'];
        }

        Response::success($items);
    }

    /**
     * Get single menu item
     * GET /api/menu/{id}
     */
    public function show(int $id): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT m.*, c.name AS category_name
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE m.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            Response::notFound('Menu item not found');
        }

        $item['id'] = (string)$item['id'];
        $item['price'] = (float)$item['price'];
        $item['quantity_available'] = (int)$item['quantity_available'];
        $item['category_id'] = $item['category_id'] ? (string)$item['category_id'] : null;
        $item['image'] = $item['image_path'] ?? '';
        $item['category'] = $item['category_name'] ?? 'Uncategorized';
        $item['stockQuantity'] = $item['quantity_available'];
        $item['isAvailable'] = $item['status'] !== 'disabled';
        $item['status'] = $item['approval_status'];

        Response::success($item);
    }

    /**
     * Create menu item
     * POST /api/menu
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        // Allow Admin, Kitchen to create menu items
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_KITCHEN);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2)
                  ->required($input, 'price')
                  ->positiveNumber($input, 'price')
                  ->required($input, 'quantity_available')
                  ->nonNegativeInt($input, 'quantity_available')
                  ->required($input, 'category_id');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $user = $_REQUEST['auth_user'];
        $db = Database::getConnection();

        // Check if category exists
        $stmt = $db->prepare('SELECT id FROM categories WHERE id = :cid LIMIT 1');
        $stmt->execute(['cid' => (int)$input['category_id']]);
        if (!$stmt->fetch()) {
            Response::error('Invalid category selected', 400);
        }

        // Kitchen submissions default to pending approval, Admin default to approved
        $approvalStatus = $user['role_name'] === ROLE_ADMIN ? APPROVAL_APPROVED : APPROVAL_PENDING;
        $status = (int)$input['quantity_available'] > 0 ? 'available' : 'out_of_stock';

        $db->beginTransaction();
        try {
            $stmt = $db->prepare('
                INSERT INTO menu_items (name, description, category_id, price, quantity_available, status, approval_status, created_by, approved_by)
                VALUES (:name, :desc, :cid, :price, :qty, :status, :approval, :creator, :approver)
            ');
            $stmt->execute([
                'name'     => Sanitizer::clean($input['name']),
                'desc'     => Sanitizer::clean($input['description'] ?? ''),
                'cid'      => (int)$input['category_id'],
                'price'    => (float)$input['price'],
                'qty'      => (int)$input['quantity_available'],
                'status'   => $status,
                'approval' => $approvalStatus,
                'creator'  => $user['id'],
                'approver' => $approvalStatus === APPROVAL_APPROVED ? $user['id'] : null
            ]);

            $itemId = (int)$db->lastInsertId();

            // Set up inventory record
            $stmt = $db->prepare('
                INSERT INTO inventory (menu_item_id, quantity, low_stock_threshold, last_updated_by)
                VALUES (:itemId, :qty, :threshold, :updater)
            ');
            $stmt->execute([
                'itemId'    => $itemId,
                'qty'       => (int)$input['quantity_available'],
                'threshold' => (int)($input['low_stock_threshold'] ?? 5),
                'updater'   => $user['id']
            ]);
            $inventoryId = (int)$db->lastInsertId();

            // Setup stock movement
            $stmt = $db->prepare('
                INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                VALUES (:invId, "add", :qty, "INITIAL_STOCK", :creator)
            ');
            $stmt->execute([
                'invId'   => $inventoryId,
                'qty'     => (int)$input['quantity_available'],
                'creator' => $user['id']
            ]);

            $db->commit();

            // Log Audit
            AuditService::menuItemCreated($itemId, $input['name']);

            // Send notification for approval if submitted by kitchen
            if ($approvalStatus === APPROVAL_PENDING) {
                $this->createNotification(
                    null,
                    ROLE_ADMIN,
                    "New Menu Approval Required",
                    "Kitchen staff {$user['full_name']} created '{$input['name']}' which requires approval.",
                    NOTIFY_MENU
                );
            }

            Response::created([
                'id' => (string)$itemId,
                'name' => $input['name'],
                'approval_status' => $approvalStatus
            ], 'Menu item created successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update menu item
     * PUT /api/menu/{id}
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_KITCHEN);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2)
                  ->required($input, 'price')
                  ->positiveNumber($input, 'price')
                  ->required($input, 'category_id');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $user = $_REQUEST['auth_user'];
        $db = Database::getConnection();

        // Fetch original item
        $stmt = $db->prepare('SELECT * FROM menu_items WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $orig = $stmt->fetch();
        if (!$orig) {
            Response::notFound('Menu item not found');
        }

        // If kitchen staff updates, force approval status back to pending
        $approvalStatus = $user['role_name'] === ROLE_ADMIN ? ($input['approval_status'] ?? $orig['approval_status']) : APPROVAL_PENDING;

        // Determine stock status
        $qty = isset($input['quantity_available']) ? (int)$input['quantity_available'] : (int)$orig['quantity_available'];
        $status = $input['status'] ?? $orig['status'];
        if ($status !== 'disabled') {
            $status = $qty > 0 ? 'available' : 'out_of_stock';
        }

        $db->beginTransaction();
        try {
            $stmt = $db->prepare('
                UPDATE menu_items
                SET name = :name, description = :desc, category_id = :cid, price = :price, 
                    quantity_available = :qty, status = :status, approval_status = :approval, approved_by = :approver
                WHERE id = :id
            ');
            $stmt->execute([
                'name'     => Sanitizer::clean($input['name']),
                'desc'     => Sanitizer::clean($input['description'] ?? ''),
                'cid'      => (int)$input['category_id'],
                'price'    => (float)$input['price'],
                'qty'      => $qty,
                'status'   => $status,
                'approval' => $approvalStatus,
                'approver' => $approvalStatus === APPROVAL_APPROVED ? $user['id'] : null,
                'id'       => $id
            ]);

            // Sync with inventory if quantity changed directly
            if ($qty !== (int)$orig['quantity_available']) {
                $stmt = $db->prepare('SELECT id, quantity FROM inventory WHERE menu_item_id = :itemId FOR UPDATE');
                $stmt->execute(['itemId' => $id]);
                $inv = $stmt->fetch();
                
                if ($inv) {
                    $diff = $qty - (int)$inv['quantity'];
                    $movementType = $diff > 0 ? 'add' : 'deduction';
                    $moveQty = abs($diff);

                    $stmt = $db->prepare('UPDATE inventory SET quantity = :qty, last_updated_by = :updater WHERE id = :invId');
                    $stmt->execute(['qty' => $qty, 'updater' => $user['id'], 'invId' => $inv['id']]);

                    // Log stock movement
                    $stmt = $db->prepare('
                        INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                        VALUES (:invId, :type, :qty, "PROFILE_MANUAL_UPDATE", :creator)
                    ');
                    $stmt->execute([
                        'invId'   => $inv['id'],
                        'type'    => $movementType,
                        'qty'     => $moveQty,
                        'creator' => $user['id']
                    ]);
                }
            }

            $db->commit();

            // Log Audit
            AuditService::menuItemApproved($id, $input['name']);

            Response::success(null, 'Menu item updated successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Delete menu item
     * DELETE /api/menu/{id}
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageMenu');

        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT id, name, image_path FROM menu_items WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            Response::notFound('Menu item not found');
        }

        $db->beginTransaction();
        try {
            // Delete menu item (cascade deletes inventory, stock movements)
            $stmt = $db->prepare('DELETE FROM menu_items WHERE id = :id');
            $stmt->execute(['id' => $id]);

            // Delete local file if exists
            if (!empty($item['image_path'])) {
                $oldPath = str_replace('/uploads/', '', $item['image_path']);
                (new FileUploadService())->delete($oldPath);
            }

            $db->commit();
            Response::success(null, 'Menu item deleted successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Approve or reject a menu item
     * PATCH /api/menu/{id}/approve
     */
    public function approve(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'approval_status')
                  ->inArray($input, 'approval_status', [APPROVAL_APPROVED, APPROVAL_REJECTED]);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = $_REQUEST['auth_user'];
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT id, name, created_by FROM menu_items WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            Response::notFound('Menu item not found');
        }

        $stmt = $db->prepare('
            UPDATE menu_items 
            SET approval_status = :status, approved_by = :approver 
            WHERE id = :id
        ');
        $stmt->execute([
            'status'   => $input['approval_status'],
            'approver' => $user['id'],
            'id'       => $id
        ]);

        // Audit Log
        AuditService::menuItemApproved($id, $item['name']);

        // Notify submitter of approval
        if ($item['created_by']) {
            $this->createNotification(
                (int)$item['created_by'],
                null,
                "Menu Item Approved",
                "Your submission '{$item['name']}' has been approved.",
                NOTIFY_MENU
            );
        }

        Response::success(null, "Menu item status updated to {$input['approval_status']}");
    }

    /**
     * Quick update stock level (cashier/kitchen/admin)
     * PATCH /api/menu/{id}/stock
     */
    public function updateStock(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('manageInventory', 'manageOrders');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'quantity')
                  ->integer($input, 'quantity')
                  ->required($input, 'movement_type')
                  ->inArray($input, 'movement_type', ['add', 'deduction', 'adjustment']);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = $_REQUEST['auth_user'];
        $qtyChange = (int)$input['quantity'];
        $type = $input['movement_type'];

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            // Select locks to prevent race conditions
            $stmt = $db->prepare('SELECT id, quantity, low_stock_threshold FROM inventory WHERE menu_item_id = :itemId FOR UPDATE');
            $stmt->execute(['itemId' => $id]);
            $inv = $stmt->fetch();

            if (!$inv) {
                Response::notFound('Inventory record not found');
            }

            $currentQty = (int)$inv['quantity'];
            $newQty = $currentQty;

            if ($type === 'add') {
                $newQty += $qtyChange;
            } elseif ($type === 'deduction') {
                if ($currentQty < $qtyChange) {
                    Response::error('Insufficient inventory stock', 400);
                }
                $newQty -= $qtyChange;
            } else { // adjustment
                $newQty = $qtyChange;
                if ($newQty < 0) {
                    Response::error('Stock cannot be negative', 400);
                }
            }

            // Update inventory
            $stmt = $db->prepare('UPDATE inventory SET quantity = :qty, last_updated_by = :updater WHERE id = :id');
            $stmt->execute(['qty' => $newQty, 'updater' => $user['id'], 'id' => $inv['id']]);

            // Sync menu item status
            $menuStatus = $newQty > 0 ? 'available' : 'out_of_stock';
            $stmt = $db->prepare('UPDATE menu_items SET quantity_available = :qty, status = :status WHERE id = :id');
            $stmt->execute(['qty' => $newQty, 'status' => $menuStatus, 'id' => $id]);

            // Write stock movement
            $stmt = $db->prepare('
                INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                VALUES (:invId, :type, :qty, :ref, :creator)
            ');
            $stmt->execute([
                'invId'   => $inv['id'],
                'type'    => $type,
                'qty'     => $type === 'adjustment' ? $newQty : $qtyChange,
                'ref'     => Sanitizer::clean($input['reference'] ?? 'QUICK_STOCK_UPDATE'),
                'creator' => $user['id']
            ]);

            // Check low stock threshold alert
            if ($newQty <= (int)$inv['low_stock_threshold'] && $newQty < $currentQty) {
                // Fetch item name
                $stmtName = $db->prepare('SELECT name FROM menu_items WHERE id = :id LIMIT 1');
                $stmtName->execute(['id' => $id]);
                $itemName = $stmtName->fetchColumn() ?: 'Item';

                $this->createNotification(
                    null,
                    ROLE_ADMIN,
                    "Low Stock Alert",
                    "Stock level for '{$itemName}' is low. Current quantity: {$newQty}",
                    NOTIFY_STOCK
                );
            }

            $db->commit();
            Response::success(['newQuantity' => $newQty], 'Stock updated successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Upload menu item image
     * POST /api/menu/{id}/image
     */
    public function uploadImage(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_KITCHEN);

        if (empty($_FILES['image'])) {
            Response::error('No image file uploaded', 400);
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT image_path FROM menu_items WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            Response::notFound('Menu item not found');
        }

        $uploadService = new FileUploadService();
        $result = $uploadService->upload($_FILES['image'], 'menu');

        if (!$result['success']) {
            Response::error($result['error'], 400);
        }

        $db->beginTransaction();
        try {
            // Update database path
            $stmt = $db->prepare('UPDATE menu_items SET image_path = :path WHERE id = :id');
            $stmt->execute(['path' => $result['url'], 'id' => $id]);

            // Delete old file if exists
            if (!empty($item['image_path'])) {
                $oldPath = str_replace('/uploads/', '', $item['image_path']);
                $uploadService->delete($oldPath);
            }

            $db->commit();
            Response::success([
                'url' => $result['url']
            ], 'Menu item image uploaded successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            $uploadService->delete($result['path']);
            throw $e;
        }
    }

    /**
     * Helper to create inline notification
     */
    private function createNotification(?int $userId, ?string $roleTarget, string $title, string $message, string $type): void
    {
        try {
            $db = Database::getConnection();
            $stmt = $db->prepare('
                INSERT INTO notifications (user_id, role_target, title, message, type, is_read)
                VALUES (:uid, :role, :title, :message, :type, 0)
            ');
            $stmt->execute([
                'uid'     => $userId,
                'role'    => $roleTarget,
                'title'   => $title,
                'message' => $message,
                'type'    => $type
            ]);
        } catch (\Throwable $e) {
            error_log("Failed to create inline notification in MenuController: " . $e->getMessage());
        }
    }
}
