<?php
/**
 * Queen Eatery Palace - Inventory Controller
 * 
 * Handles general inventory adjustments, listing, and low-stock alerts.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class InventoryController
{
    /**
     * List all inventory records
     * GET /api/inventory
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN);

        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT i.*, m.name AS item_name, m.image_path AS item_image, m.price AS item_price, c.name AS category_name
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            LEFT JOIN categories c ON m.category_id = c.id
            ORDER BY m.name ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            $rec['id'] = (string)$rec['id'];
            $rec['menu_item_id'] = (string)$rec['menu_item_id'];
            $rec['quantity'] = (int)$rec['quantity'];
            $rec['low_stock_threshold'] = (int)$rec['low_stock_threshold'];
            $rec['item_price'] = (float)$rec['item_price'];
        }

        Response::success($records);
    }

    /**
     * Update inventory threshold and quantity
     * PUT /api/inventory/{menu_item_id}
     */
    public function update(int $menu_item_id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('manageInventory', 'manageMenu');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'low_stock_threshold')->nonNegativeInt($input, 'low_stock_threshold')
                  ->required($input, 'quantity')->nonNegativeInt($input, 'quantity');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = $_REQUEST['auth_user'];
        $qty = (int)$input['quantity'];
        $threshold = (int)$input['low_stock_threshold'];

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            // Lock row FOR UPDATE
            $stmt = $db->prepare('SELECT id, quantity FROM inventory WHERE menu_item_id = :mid FOR UPDATE');
            $stmt->execute(['mid' => $menu_item_id]);
            $inv = $stmt->fetch();

            if (!$inv) {
                Response::notFound('Inventory record not found');
            }

            $currentQty = (int)$inv['quantity'];
            $diff = $qty - $currentQty;

            // Update inventory
            $stmt = $db->prepare('
                UPDATE inventory 
                SET quantity = :qty, low_stock_threshold = :threshold, last_updated_by = :user
                WHERE menu_item_id = :mid
            ');
            $stmt->execute([
                'qty'       => $qty,
                'threshold' => $threshold,
                'user'      => $user['id'],
                'mid'       => $menu_item_id
            ]);

            // Sync menu_items table
            $menuStatus = $qty > 0 ? 'available' : 'out_of_stock';
            $stmt = $db->prepare('UPDATE menu_items SET quantity_available = :qty, status = :status WHERE id = :mid');
            $stmt->execute(['qty' => $qty, 'status' => $menuStatus, 'mid' => $menu_item_id]);

            // Log stock movement if quantity changed
            if ($diff !== 0) {
                $type = $diff > 0 ? 'add' : 'deduction';
                $stmt = $db->prepare('
                    INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                    VALUES (:invId, :type, :qty, "MANUAL_INVENTORY_ADJUST", :creator)
                ');
                $stmt->execute([
                    'invId'   => $inv['id'],
                    'type'    => $type,
                    'qty'     => abs($diff),
                    'creator' => $user['id']
                ]);
            }

            $db->commit();
            Response::success(null, 'Inventory updated successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Get low stock inventory items
     * GET /api/inventory/low-stock
     */
    public function lowStock(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN);

        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT i.*, m.name AS item_name, m.price AS item_price
            FROM inventory i
            JOIN menu_items m ON i.menu_item_id = m.id
            WHERE i.quantity <= i.low_stock_threshold
            ORDER BY i.quantity ASC
        ');
        $records = $stmt->fetchAll();

        foreach ($records as &$rec) {
            $rec['id'] = (string)$rec['id'];
            $rec['menu_item_id'] = (string)$rec['menu_item_id'];
            $rec['quantity'] = (int)$rec['quantity'];
            $rec['low_stock_threshold'] = (int)$rec['low_stock_threshold'];
            $rec['item_price'] = (float)$rec['item_price'];
        }

        Response::success($records);
    }
}
