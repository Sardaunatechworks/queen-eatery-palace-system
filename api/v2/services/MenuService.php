<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Menu Service
 *
 * Orchestrates menu, inventory, notification, and audit logic.
 * Controllers should delegate business logic here.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Helpers\Sanitizer;
use App\Repositories\MenuRepository;
use App\Repositories\CategoryRepository;
use App\Repositories\InventoryRepository;

class MenuService
{
    // ============================================
    // Menu Item Operations
    // ============================================

    /**
     * List menu items for staff (all items, paginated).
     */
    public function listItems(array $params): array
    {
        $page           = max(1, (int) ($params['page'] ?? 1));
        $perPage        = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? DEFAULT_PAGE_SIZE)));
        $search         = isset($params['search']) ? Sanitizer::clean($params['search']) : null;
        $categoryId     = isset($params['category_id']) ? (int) $params['category_id'] : null;
        $status         = $params['status'] ?? null;
        $approvalStatus = $params['approval_status'] ?? null;

        return MenuRepository::list($page, $perPage, $search, $categoryId, $status, $approvalStatus);
    }

    /**
     * List public menu items (approved, non-disabled).
     */
    public function listPublicItems(array $params): array
    {
        $page       = max(1, (int) ($params['page'] ?? 1));
        $perPage    = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? DEFAULT_PAGE_SIZE)));
        $search     = isset($params['search']) ? Sanitizer::clean($params['search']) : null;
        $categoryId = isset($params['category_id']) ? (int) $params['category_id'] : null;

        return MenuRepository::listPublic($page, $perPage, $search, $categoryId);
    }

    /**
     * Get a single menu item by ID.
     */
    public function getItem(int $id): ?array
    {
        return MenuRepository::findById($id);
    }

    /**
     * Create a new menu item with inventory record.
     */
    public function createItem(array $data, array $authUser): array
    {
        // Validate category exists
        $category = CategoryRepository::findById((int) $data['category_id']);
        if (!$category) {
            return ['success' => false, 'message' => 'Invalid category selected'];
        }

        // Kitchen submissions default to pending; admin auto-approves
        $isAdmin = in_array($authUser['role_name'], [ROLE_SUPER_ADMIN, ROLE_ADMIN], true);
        $approvalStatus = $isAdmin ? APPROVAL_APPROVED : APPROVAL_PENDING;

        $trackInventory = isset($data['track_inventory']) ? (int) (bool) $data['track_inventory'] : 1;
        $uom = Sanitizer::clean($data['unit_of_measure'] ?? 'portion');
        $qty = (float) ($data['quantity_available'] ?? 0);
        $status = $trackInventory ? ($qty > 0 ? 'available' : 'out_of_stock') : 'available';

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            // Create menu item
            $itemId = MenuRepository::create([
                'name'               => Sanitizer::clean($data['name']),
                'description'        => Sanitizer::clean($data['description'] ?? ''),
                'category_id'        => (int) $data['category_id'],
                'price'              => Sanitizer::float($data['price']),
                'image_path'         => $data['image_path'] ?? $data['image'] ?? null,
                'quantity_available' => $qty,
                'track_inventory'    => $trackInventory,
                'unit_of_measure'    => $uom,
                'status'             => $status,
                'approval_status'    => $approvalStatus,
                'requires_packaging' => isset($data['requires_packaging']) ? (int) (bool) $data['requires_packaging'] : 1,
                'created_by'         => (int) $authUser['id'],
                'approved_by'        => $isAdmin ? (int) $authUser['id'] : null,
            ]);

            // Create inventory record
            $threshold = (float) ($data['low_stock_threshold'] ?? 5);
            $inventoryId = InventoryRepository::createForMenuItem(
                $itemId,
                $qty,
                $threshold,
                (int) $authUser['id']
            );

            // Log initial stock movement via InventoryService
            InventoryService::recordInitialStock($inventoryId, $qty, (int) $authUser['id']);

            $db->commit();

            // Audit log
            AuditService::menuItemCreated($itemId, $data['name']);

            // Notification for kitchen submissions
            if ($approvalStatus === APPROVAL_PENDING) {
                NotificationService::toRole(
                    ROLE_ADMIN,
                    'New Menu Approval Required',
                    "Kitchen staff {$authUser['full_name']} created '{$data['name']}' which requires approval.",
                    NOTIFY_MENU
                );
            }

            $item = MenuRepository::findById($itemId);

            return [
                'success' => true,
                'data'    => $item,
                'message' => 'Menu item created successfully',
            ];
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update an existing menu item.
     */
    public function updateItem(int $id, array $data, array $authUser): array
    {
        $original = MenuRepository::findById($id);
        if (!$original) {
            return ['success' => false, 'message' => 'Menu item not found', 'code' => 404];
        }

        // Validate category if changed
        if (isset($data['category_id'])) {
            $category = CategoryRepository::findById((int) $data['category_id']);
            if (!$category) {
                return ['success' => false, 'message' => 'Invalid category selected'];
            }
        }

        $isAdmin = in_array($authUser['role_name'], [ROLE_SUPER_ADMIN, ROLE_ADMIN], true);

        // Kitchen edits reset approval to pending
        $approvalStatus = $isAdmin
            ? ($data['approval_status'] ?? $original['approval_status'])
            : APPROVAL_PENDING;

        // Determine track_inventory, unit_of_measure, quantity, and status
        $trackInventory = isset($data['track_inventory'])
            ? (int) (bool) $data['track_inventory']
            : (int) ($original['track_inventory'] ?? 1);

        $uom = isset($data['unit_of_measure'])
            ? Sanitizer::clean($data['unit_of_measure'])
            : ($original['unit_of_measure'] ?? 'portion');

        $qty = isset($data['quantity_available']) ? (float) $data['quantity_available'] : (float) $original['quantity_available'];
        $itemStatus = $data['status'] ?? $original['status'];
        if ($itemStatus !== 'disabled') {
            $itemStatus = $trackInventory ? ($qty > 0 ? 'available' : 'out_of_stock') : 'available';
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $updateData = [
                'name'               => Sanitizer::clean($data['name'] ?? $original['name']),
                'description'        => Sanitizer::clean($data['description'] ?? $original['description'] ?? ''),
                'category_id'        => (int) ($data['category_id'] ?? $original['category_id']),
                'price'              => Sanitizer::float($data['price'] ?? $original['price']),
                'quantity_available' => $qty,
                'track_inventory'    => $trackInventory,
                'unit_of_measure'    => $uom,
                'status'             => $itemStatus,
                'approval_status'    => $approvalStatus,
                'requires_packaging' => isset($data['requires_packaging']) ? (int) (bool) $data['requires_packaging'] : ($original['requires_packaging'] ?? 1),
                'approved_by'        => $approvalStatus === APPROVAL_APPROVED ? (int) $authUser['id'] : null,
            ];

            if (isset($data['image_path'])) {
                $updateData['image_path'] = $data['image_path'];
            } elseif (isset($data['image'])) {
                $updateData['image_path'] = $data['image'];
            }

            MenuRepository::update($id, $updateData);

            // Sync inventory if quantity changed
            if ($qty != (float) $original['quantity_available']) {
                $inv = InventoryRepository::findByMenuItemIdForUpdate($id);
                if ($inv) {
                    $oldQty = (float) $inv['quantity'];
                    $diff = $qty - $oldQty;

                    InventoryRepository::updateQuantity($inv['id'], $qty, (int) $authUser['id']);

                    if ($diff != 0) {
                        InventoryRepository::createStockMovement(
                            $inv['id'],
                            'manual_adjust',
                            abs($diff),
                            'MENU_ITEM_UPDATE',
                            (int) $authUser['id'],
                            'Updated from menu item edit',
                            $oldQty,
                            $qty
                        );
                    }
                }
            }

            $db->commit();

            // Audit
            AuditService::menuItemUpdated($id, $updateData['name']);

            $updated = MenuRepository::findById($id);

            return [
                'success' => true,
                'data'    => $updated,
                'message' => 'Menu item updated successfully',
            ];
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Delete a menu item.
     */
    public function deleteItem(int $id, array $authUser): array
    {
        $item = MenuRepository::findById($id);
        if (!$item) {
            return ['success' => false, 'message' => 'Menu item not found', 'code' => 404];
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            // Delete menu item (cascade deletes inventory, stock movements)
            MenuRepository::delete($id);

            // Delete local image file if exists
            if (!empty($item['image_path'])) {
                try {
                    $uploadService = new FileUploadService();
                    $relativePath = str_replace('/uploads/', '', $item['image_path']);
                    $uploadService->delete($relativePath);
                } catch (\Throwable $e) {
                    error_log("Failed to delete menu image: " . $e->getMessage());
                }
            }

            $db->commit();

            // Audit
            AuditService::menuItemDeleted($id, $item['name']);

            return ['success' => true, 'message' => 'Menu item deleted successfully'];
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Approve or reject a menu item.
     */
    public function approveItem(int $id, string $status, array $authUser): array
    {
        $item = MenuRepository::findById($id);
        if (!$item) {
            return ['success' => false, 'message' => 'Menu item not found', 'code' => 404];
        }

        MenuRepository::updateApproval($id, $status, (int) $authUser['id']);

        // Audit
        AuditService::log(
            'menu.approval_changed',
            'menu_item',
            (string) $id,
            "Menu item '{$item['name']}' {$status}",
            ['approval_status' => $item['approval_status']],
            ['approval_status' => $status]
        );

        // Notify the creator
        if ($item['created_by']) {
            $statusLabel = $status === APPROVAL_APPROVED ? 'approved' : 'rejected';
            $adminName = $authUser['full_name'] ?? 'Management';
            NotificationService::toUser(
                (int) $item['created_by'],
                'Menu Item ' . ucfirst($statusLabel),
                "Your dish submission '{$item['name']}' has been {$statusLabel} by {$adminName}.",
                NOTIFY_MENU
            );
        }

        return [
            'success' => true,
            'message' => "Menu item status updated to {$status}",
        ];
    }

    // ============================================
    // Stock Operations
    // ============================================

    /**
     * Update stock level for a menu item via InventoryService.
     */
    public function updateStock(int $menuItemId, array $data, array $authUser): array
    {
        $qty = (float) $data['quantity'];
        $type = $data['movement_type'] ?? 'manual_adjust';
        $userId = (int) $authUser['id'];
        $notes = Sanitizer::clean($data['notes'] ?? $data['reference'] ?? 'Stock update via menu');

        if ($type === 'add' || $type === 'stock_in') {
            $res = InventoryService::stockIn($menuItemId, $qty, $notes, $userId);
            return [
                'success' => $res['success'],
                'message' => $res['message'],
                'data'    => $res['data'] ?? [],
            ];
        }

        if ($type === 'wastage' || $type === 'damaged') {
            $res = InventoryService::recordWastage($menuItemId, $qty, $notes, $userId, $type);
            return [
                'success' => $res['success'],
                'message' => $res['message'],
                'data'    => $res['data'] ?? [],
            ];
        }

        // Default: manual adjust to absolute qty
        $res = InventoryService::manualAdjust($menuItemId, $qty, $notes, $userId);
        return [
            'success' => $res['success'],
            'message' => $res['message'],
            'data'    => $res['data'] ?? [],
        ];
    }

    // ============================================
    // Image Upload
    // ============================================

    /**
     * Upload an image for a menu item.
     */
    public function uploadImage(int $id, array $file): array
    {
        $item = MenuRepository::findById($id);
        if (!$item) {
            return ['success' => false, 'message' => 'Menu item not found', 'code' => 404];
        }

        $uploadService = new FileUploadService();
        $result = $uploadService->upload($file, 'menu');

        if (!$result['success']) {
            return ['success' => false, 'message' => $result['error']];
        }

        // Update database
        MenuRepository::updateImagePath($id, $result['url']);

        // Delete old file if exists
        if (!empty($item['image_path'])) {
            $oldPath = str_replace('/uploads/', '', $item['image_path']);
            $uploadService->delete($oldPath);
        }

        return [
            'success' => true,
            'data'    => ['url' => $result['url']],
            'message' => 'Menu item image uploaded successfully',
        ];
    }
}
