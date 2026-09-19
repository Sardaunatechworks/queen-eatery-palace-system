<?php
/**
 * Queen Eatery Palace - Order Controller
 * 
 * Handles order placements, listing, status updates, and transactional inventory safety.
 * Uses OrderItemService for batch-loading order items (eliminates N+1 queries).
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\AuditService;
use App\Services\OrderItemService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use PDO;

class OrderController
{
    /**
     * List all orders (Staff) — with pagination
     * GET /api/orders
     * Query params: ?page=1&limit=50
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN);

        $db = Database::getConnection();

        // Pagination params
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        // Total count (single fast query using existing idx_created_at index)
        $countStmt = $db->query('SELECT COUNT(id) FROM orders');
        $total = (int)$countStmt->fetchColumn();

        // Fetch paginated orders
        $stmt = $db->prepare('
            SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            ORDER BY o.created_at DESC
            LIMIT :limit OFFSET :offset
        ');
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $orders = $stmt->fetchAll();

        // Batch-load items + normalize (replaces N+1 loop)
        OrderItemService::prepareForResponse($orders);

        Response::paginated($orders, $total, $page, $limit);
    }

    /**
     * List authenticated customer's own orders — with pagination
     * GET /api/orders/my-orders
     * Query params: ?page=1&limit=30
     */
    public function myOrders(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $db = Database::getConnection();

        // Pagination params
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 30)));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $db->prepare('SELECT COUNT(id) FROM orders WHERE customer_id = :uid');
        $countStmt->execute(['uid' => $user['id']]);
        $total = (int)$countStmt->fetchColumn();

        // Fetch paginated
        $stmt = $db->prepare('
            SELECT o.*, u.full_name AS customer_name
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.customer_id = :uid
            ORDER BY o.created_at DESC
            LIMIT :limit OFFSET :offset
        ');
        $stmt->bindValue(':uid', $user['id'], PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $orders = $stmt->fetchAll();

        // Batch-load items + normalize
        OrderItemService::prepareForResponse($orders);

        Response::paginated($orders, $total, $page, $limit);
    }

    /**
     * List active pending orders (Workflow: received, preparing, ready)
     * GET /api/orders/pending
     * No pagination — active orders are always a small set.
     */
    public function pending(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN);

        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.order_status IN ("received", "preparing", "ready")
            ORDER BY o.created_at ASC
        ');
        $orders = $stmt->fetchAll();

        // Batch-load items + normalize (replaces N+1 loop)
        OrderItemService::prepareForResponse($orders);

        Response::success($orders);
    }

    /**
     * Show detailed single order
     * GET /api/orders/{id}
     */
    public function show(int $id): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];

        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.id = :id
            LIMIT 1
        ');
        $stmt->execute(['id' => $id]);
        $order = $stmt->fetch();

        if (!$order) {
            Response::notFound('Order not found');
        }

        // Customer can only view their own orders
        $isStaff = in_array($user['role_name'], [ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN], true);
        if (!$isStaff && (int)$order['customer_id'] !== $user['id']) {
            Response::forbidden('Access denied');
        }

        // Single order — use batch loader with a 1-element array (still 1 query, consistent pattern)
        $orders = [$order];
        OrderItemService::prepareForResponse($orders);
        $order = $orders[0];

        // Get associated transactions
        $txStmt = $db->prepare('SELECT transaction_reference AS reference, amount, payment_method, payment_status AS status, created_at FROM transactions WHERE order_id = :oid');
        $txStmt->execute(['oid' => $id]);
        $order['transactions'] = $txStmt->fetchAll();

        Response::success($order);
    }

    /**
     * Create order (places items and handles row locks for inventory safety)
     * POST /api/orders
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        $user = $_REQUEST['auth_user'];
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'items')->isArray($input, 'items')
                  ->required($input, 'order_type')
                  ->inArray($input, 'order_type', ['dine_in', 'takeaway', 'delivery'])
                  ->required($input, 'payment_method')
                  ->inArray($input, 'payment_method', ['cash', 'paystack']);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $totalAmount = 0.00;
            $itemsToProcess = [];

            // 1. Lock inventory rows & validate stock availability before any writes
            foreach ($input['items'] as $itemInput) {
                $itemId = (int)($itemInput['menu_item_id'] ?? $itemInput['id'] ?? 0);
                $qtyOrdered = (int)($itemInput['quantity'] ?? 0);

                if ($itemId <= 0 || $qtyOrdered <= 0) {
                    Response::error('Invalid order items', 400);
                }

                // Lock the menu item row FOR UPDATE
                $stmt = $db->prepare('SELECT id, name, price, quantity_available, status FROM menu_items WHERE id = :id FOR UPDATE');
                $stmt->execute(['id' => $itemId]);
                $menuItem = $stmt->fetch();

                if (!$menuItem) {
                    Response::error("Menu item not found: ID {$itemId}", 400);
                }

                if ($menuItem['status'] === 'disabled') {
                    Response::error("Item '{$menuItem['name']}' is no longer available", 400);
                }

                if ((int)$menuItem['quantity_available'] < $qtyOrdered) {
                    Response::error("Insufficient stock for '{$menuItem['name']}'. Available: {$menuItem['quantity_available']}", 400);
                }

                $itemPrice = (float)$menuItem['price'];
                $totalAmount += $itemPrice * $qtyOrdered;

                $itemsToProcess[] = [
                    'id' => $itemId,
                    'name' => $menuItem['name'],
                    'quantity' => $qtyOrdered,
                    'price' => $itemPrice
                ];
            }

            // 2. Generate unique sequential Order Number (QEP-YYYYMMDD-XXXX)
            $datePrefix = 'QEP-' . date('Ymd') . '-';
            $stmt = $db->prepare('SELECT COUNT(id) FROM orders WHERE order_number LIKE :prefix');
            $stmt->execute(['prefix' => $datePrefix . '%']);
            $count = (int)$stmt->fetchColumn();
            $orderNumber = $datePrefix . str_pad((string)($count + 1), 4, '0', STR_PAD_LEFT);

            // 3. Insert Order
            // Online/delivery/takeaway starts as 'received'. If payment_method is paystack, starts as 'pending_payment'.
            $status = 'received';
            if ($input['payment_method'] === 'paystack') {
                $status = 'pending_payment';
            }

            $stmt = $db->prepare('
                INSERT INTO orders (customer_id, order_number, subtotal, total, order_status, payment_status, order_type, delivery_address)
                VALUES (:uid, :num, :total, :total, :status, "pending", :type, :address)
            ');
            $stmt->execute([
                'uid'     => $user['id'],
                'num'     => $orderNumber,
                'total'   => $totalAmount,
                'status'  => $status,
                'type'    => $input['order_type'],
                'address' => Sanitizer::clean($input['delivery_address'] ?? '')
            ]);

            $orderId = (int)$db->lastInsertId();

            // 4. Process Items & Deduct Stock
            $insItemStmt = $db->prepare('
                INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, subtotal)
                VALUES (:oid, :mid, :name, :qty, :price, :subtotal)
            ');

            $updMenuStockStmt = $db->prepare('
                UPDATE menu_items 
                SET quantity_available = quantity_available - :qty,
                    status = IF(quantity_available <= 0, "out_of_stock", "available")
                WHERE id = :id
            ');

            $lockInvStmt = $db->prepare('SELECT id, quantity FROM inventory WHERE menu_item_id = :mid FOR UPDATE');
            $updInvStmt = $db->prepare('UPDATE inventory SET quantity = quantity - :qty, last_updated_by = :updater WHERE id = :id');

            $smStmt = $db->prepare('
                INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                VALUES (:invId, "deduction", :qty, :ref, :creator)
            ');

            foreach ($itemsToProcess as $item) {
                // Write order item
                $insItemStmt->execute([
                    'oid'      => $orderId,
                    'mid'      => $item['id'],
                    'name'     => $item['name'],
                    'qty'      => $item['quantity'],
                    'price'    => $item['price'],
                    'subtotal' => $item['quantity'] * $item['price']
                ]);

                // Deduct menu item quantity
                $updMenuStockStmt->execute([
                    'qty' => $item['quantity'],
                    'id'  => $item['id']
                ]);

                // Lock and deduct inventory table
                $lockInvStmt->execute(['mid' => $item['id']]);
                $inv = $lockInvStmt->fetch();
                if ($inv) {
                    $updInvStmt->execute([
                        'qty'     => $item['quantity'],
                        'updater' => $user['id'],
                        'id'      => $inv['id']
                    ]);

                    // Log stock movement
                    $smStmt->execute([
                        'invId'   => $inv['id'],
                        'qty'     => $item['quantity'],
                        'ref'     => "ORDER_{$orderNumber}",
                        'creator' => $user['id']
                    ]);
                }
            }

            // 5. If paid via Cash immediately (e.g. Cashier Terminal order), insert transaction record
            if ($input['payment_method'] === 'cash') {
                $txStmt = $db->prepare('
                    INSERT INTO transactions (order_id, transaction_reference, amount, payment_method, payment_status)
                    VALUES (:oid, :ref, :amount, "cash", "success")
                ');
                $txStmt->execute([
                    'oid'    => $orderId,
                    'ref'    => "CASH_" . bin2hex(random_bytes(8)),
                    'amount' => $totalAmount
                ]);

                // Update payment status to paid
                $db->prepare('UPDATE orders SET payment_status = "paid" WHERE id = ' . $orderId)->execute();
            }

            $db->commit();

            // Log Audit
            AuditService::orderCreated($orderId, $orderNumber);

            // Notify Cashier / Kitchen about new order
            $this->createNotification(
                null,
                ROLE_CASHIER,
                "New Order Placed",
                "Order {$orderNumber} has been received. Total: ₦" . number_format($totalAmount, 2),
                NOTIFY_ORDER
            );

            Response::created([
                'id'           => (string)$orderId,
                'orderNumber'  => $orderNumber,
                'total_amount' => $totalAmount,
                'status'       => $status
            ], 'Order placed successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update order status (prepare, ready, completed, cancel)
     * PATCH /api/orders/{id}/status
     */
    public function updateStatus(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'status')
                  ->inArray($input, 'status', ['received', 'preparing', 'ready', 'completed', 'cancelled']);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $user = $_REQUEST['auth_user'];
        $newStatus = $input['status'];

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $stmt = $db->prepare('SELECT id, order_number, customer_id, order_status, total FROM orders WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $order = $stmt->fetch();

            if (!$order) {
                Response::notFound('Order not found');
            }

            $oldStatus = $order['order_status'];

            // Prevent updating if already completed or cancelled
            if ($oldStatus === 'completed' || $oldStatus === 'cancelled') {
                Response::error("Cannot update status of a {$oldStatus} order", 400);
            }

            // Update status
            $stmt = $db->prepare('UPDATE orders SET order_status = :status WHERE id = :id');
            $stmt->execute(['status' => $newStatus, 'id' => $id]);

            // If cancelled, RESTORE stock back to inventory
            if ($newStatus === 'cancelled') {
                // Batch-load items for this single order
                $itemsMap = OrderItemService::batchLoad([$id]);
                $orderItems = $itemsMap[$id] ?? [];

                $updMenuStockStmt = $db->prepare('
                    UPDATE menu_items 
                    SET quantity_available = quantity_available + :qty,
                        status = "available"
                    WHERE id = :id
                ');

                $lockInvStmt = $db->prepare('SELECT id FROM inventory WHERE menu_item_id = :mid FOR UPDATE');
                $updInvStmt = $db->prepare('UPDATE inventory SET quantity = quantity + :qty, last_updated_by = :updater WHERE id = :id');

                $smStmt = $db->prepare('
                    INSERT INTO stock_movements (inventory_id, movement_type, quantity, reference_id, created_by)
                    VALUES (:invId, "add", :qty, :ref, :creator)
                ');

                foreach ($orderItems as $item) {
                    $itemId = (int)$item['menu_item_id'];
                    $qty = (int)$item['quantity'];

                    // Restore menu_items qty
                    $updMenuStockStmt->execute(['qty' => $qty, 'id' => $itemId]);

                    // Restore inventory table qty
                    $lockInvStmt->execute(['mid' => $itemId]);
                    $inv = $lockInvStmt->fetch();
                    if ($inv) {
                        $updInvStmt->execute([
                            'qty'     => $qty,
                            'updater' => $user['id'],
                            'id'      => $inv['id']
                        ]);

                        // Log stock movement
                        $smStmt->execute([
                            'invId'   => $inv['id'],
                            'qty'     => $qty,
                            'ref'     => "CANCEL_{$order['order_number']}",
                            'creator' => $user['id']
                        ]);
                    }
                }
            }

            $db->commit();

            // Log Audit
            AuditService::orderStatusChanged($id, $oldStatus, $newStatus);

            // Notify Customer of status update
            if ($order['customer_id']) {
                $this->createNotification(
                    (int)$order['customer_id'],
                    null,
                    "Order Update",
                    "Your order {$order['order_number']} status is now: " . strtoupper($newStatus),
                    NOTIFY_ORDER
                );
            }

            Response::success(null, "Order status updated to {$newStatus}");

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Delete order
     * DELETE /api/orders/{id}
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $db = Database::getConnection();
        
        $stmt = $db->prepare('SELECT id, order_number FROM orders WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            Response::notFound('Order not found');
        }

        $db->beginTransaction();
        try {
            $stmtItem = $db->prepare('DELETE FROM order_items WHERE order_id = :id');
            $stmtItem->execute(['id' => $id]);

            $stmtTx = $db->prepare('DELETE FROM transactions WHERE order_id = :id');
            $stmtTx->execute(['id' => $id]);

            $stmtOrd = $db->prepare('DELETE FROM orders WHERE id = :id');
            $stmtOrd->execute(['id' => $id]);

            $db->commit();
            Response::success(null, 'Order deleted successfully');
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    // ============================================
    // HELPERS
    // ============================================

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
            error_log("Failed to create inline notification in OrderController: " . $e->getMessage());
        }
    }
}
