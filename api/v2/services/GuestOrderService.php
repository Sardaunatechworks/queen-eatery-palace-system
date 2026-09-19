<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Guest Order Service
 *
 * Orchestrates anonymous dine-in QR table orders.
 * Enforces server-side authoritative pricing, inventory reservation,
 * cashier notification, idempotency protection, and safe guest tracking.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Repositories\TableRepository;
use App\Repositories\MenuRepository;
use App\Repositories\OrderRepository;
use App\Repositories\InventoryRepository;
use App\Repositories\SettingRepository;
use App\Services\PricingService;
use App\Services\NotificationService;
use App\Services\AuditService;
use App\Helpers\Sanitizer;
use PDO;

class GuestOrderService
{
    /**
     * Fetch available menu items for QR guest ordering.
     * Only returns approved, available, in-stock items.
     */
    public function getGuestMenu(string $token): array
    {
        $table = TableRepository::findByPublicToken($token);
        if (!$table || $table['status'] !== 'active' || !$table['qr_enabled']) {
            return [
                'success' => false,
                'message' => 'Table ordering link is not active.',
                'code'    => 404,
            ];
        }

        $db = Database::getConnection();
        $stmt = $db->query("
            SELECT m.id, m.name, m.description, m.price, m.image_path,
                   m.quantity_available, m.track_inventory, m.unit_of_measure,
                   c.name AS category_name, c.id AS category_id
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            WHERE m.status = 'available'
              AND m.approval_status = 'approved'
              AND (m.track_inventory = 0 OR m.quantity_available > 0)
            ORDER BY c.sort_order ASC, m.name ASC
        ");
        $items = $stmt->fetchAll();

        foreach ($items as &$item) {
            $item['id'] = (int) $item['id'];
            $item['price'] = (float) $item['price'];
            $item['quantity_available'] = (float) $item['quantity_available'];
            $item['track_inventory'] = (bool) $item['track_inventory'];
            $item['category_id'] = $item['category_id'] !== null ? (int) $item['category_id'] : null;
            $imgPath = $item['image_path'] ?? ($item['image'] ?? '');
            $item['image_path'] = $imgPath;
            $item['image_url'] = $imgPath;
        }

        // Fetch active categories
        $catStmt = $db->query("
            SELECT id, name, sort_order
            FROM categories
            WHERE status = 'active'
            ORDER BY sort_order ASC, name ASC
        ");
        $categories = $catStmt->fetchAll();

        $policy = SettingRepository::get('qr_payment_policy', 'customer_choice');

        return [
            'success' => true,
            'data'    => [
                'table'      => [
                    'table_number'     => $table['table_number'],
                    'label'            => $table['name'] ?? null,
                    'name'             => $table['name'] ?? null,
                    'ordering_enabled' => ($table['status'] === 'active' && (bool) $table['qr_enabled']),
                ],
                'categories' => $categories,
                'menu'       => $items,
                'items'      => $items,
                'settings'   => [
                    'restaurant_name' => SettingRepository::get('restaurant_name', "Queen's Palace Eatery"),
                    'currency'        => 'NGN',
                    'payment_policy'  => $policy,
                ],
            ],
        ];
    }

    /**
     * Submit an anonymous guest QR table order.
     */
    public function submitOrder(string $token, array $payload): array
    {
        // 1. Validate Table Token
        $cleanToken = trim($token);
        $table = TableRepository::findByPublicToken($cleanToken);
        if (!$table || $table['status'] !== 'active' || !$table['qr_enabled']) {
            return [
                'success' => false,
                'message' => 'This table ordering link is no longer active. Please request assistance from staff.',
                'code'    => 403,
            ];
        }

        // 2. Validate Guest Details
        $guestName = Sanitizer::clean($payload['guest_name'] ?? '');
        if (empty($guestName) || strlen($guestName) < 2) {
            return ['success' => false, 'message' => 'Please provide your name to place the order.'];
        }

        $itemsInput = $payload['items'] ?? [];
        if (empty($itemsInput) || !is_array($itemsInput)) {
            return ['success' => false, 'message' => 'Your cart is empty. Please select at least one item.'];
        }

        // 3. Idempotency Check (Prevent duplicate orders from double-tapping)
        $idempotencyToken = !empty($payload['idempotency_token']) ? trim((string) $payload['idempotency_token']) : null;
        if ($idempotencyToken) {
            $db = Database::getConnection();
            $checkStmt = $db->prepare("
                SELECT id, order_number, guest_access_token 
                FROM orders 
                WHERE idempotency_token = :idem AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                LIMIT 1
            ");
            $checkStmt->execute(['idem' => $idempotencyToken]);
            $existing = $checkStmt->fetch();
            if ($existing) {
                return [
                    'success' => true,
                    'message' => 'Order already submitted',
                    'data'    => [
                        'order_number'       => $existing['order_number'],
                        'guest_access_token' => $existing['guest_access_token'],
                        'tracking_url'       => '/q/track/' . $existing['guest_access_token'],
                    ],
                ];
            }
        }

        // 4. Validate Order Limits (Prevent malicious enormous anonymous orders)
        $totalItemsCount = 0;
        foreach ($itemsInput as $i) {
            $qty = (int) ($i['quantity'] ?? 0);
            if ($qty > 20) {
                return ['success' => false, 'message' => 'Maximum allowed quantity per item is 20 portions.'];
            }
            $totalItemsCount += $qty;
        }
        if ($totalItemsCount > 50) {
            return ['success' => false, 'message' => 'Order size exceeds maximum allowed dine-in limit (50 items).'];
        }

        $paymentTiming = ($payload['payment_timing'] ?? 'after_meal') === 'before_meal' ? 'before_meal' : 'after_meal';
        $orderNotes = !empty($payload['notes']) ? Sanitizer::clean((string) $payload['notes']) : null;

        // 5. Begin Transaction & Pessimistic Stock Lock
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $itemsToProcess = [];
            $totalAmount = 0.00;

            foreach ($itemsInput as $itemInput) {
                $menuItemId = (int) ($itemInput['menu_item_id'] ?? $itemInput['id'] ?? 0);
                $qtyOrdered = (int) ($itemInput['quantity'] ?? 0);

                if ($menuItemId <= 0 || $qtyOrdered <= 0) {
                    $db->rollBack();
                    return ['success' => false, 'message' => 'Invalid order item or quantity'];
                }

                $menuItem = MenuRepository::findByIdForUpdate($menuItemId);
                if (!$menuItem) {
                    $db->rollBack();
                    return ['success' => false, 'message' => "Item not found (ID: {$menuItemId})"];
                }

                if ($menuItem['status'] === 'disabled' || $menuItem['approval_status'] !== 'approved') {
                    $db->rollBack();
                    return ['success' => false, 'message' => "Item '{$menuItem['name']}' is currently unavailable"];
                }

                if ((bool) ($menuItem['track_inventory'] ?? true)) {
                    $availableStock = (float) $menuItem['quantity_available'];
                    if ($availableStock < $qtyOrdered) {
                        $db->rollBack();
                        return [
                            'success' => false,
                            'message' => "Insufficient stock for '{$menuItem['name']}'. Only {$availableStock} available.",
                        ];
                    }
                }

                $itemPrice = (float) $menuItem['price'];
                $itemSubtotal = round($itemPrice * $qtyOrdered, 2);
                $totalAmount += $itemSubtotal;

                $itemsToProcess[] = [
                    'menu_item_id'       => $menuItemId,
                    'item_name'          => $menuItem['name'],
                    'quantity'           => $qtyOrdered,
                    'unit_price'         => $itemPrice,
                    'subtotal'           => $itemSubtotal,
                    'requires_packaging' => false, // Dine-in QR ordering has ₦0 packaging fee
                    'notes'              => !empty($itemInput['notes']) ? Sanitizer::clean($itemInput['notes']) : null,
                ];
            }

            // 6. Calculate Authoritative Totals (Zero packaging fee for QR Dine-in)
            $pricing = PricingService::calculateOrderTotals(
                $itemsToProcess,
                'qr_guest',
                0,
                0.00,
                0.00
            );

            // 7. Generate Sequential Order Number & Random Guest Tracking Token
            $orderNumber = OrderRepository::getNextOrderNumber();
            $guestAccessToken = bin2hex(random_bytes(16)); // 32-char cryptographically secure token

            // 8. Insert Order Record
            // QR Orders start as 'submitted' (pending review by cashier)
            $orderStmt = $db->prepare("
                INSERT INTO orders (
                    order_number, customer_id, cashier_id, customer_name, guest_name,
                    guest_access_token, idempotency_token, source, table_id, table_number,
                    order_type, subtotal, packaging_quantity, packaging_unit_price, packaging_fee,
                    total, payment_status, payment_method, payment_timing, order_status, notes
                ) VALUES (
                    :order_number, NULL, NULL, :customer_name, :guest_name,
                    :guest_access_token, :idempotency_token, 'qr_guest', :table_id, :table_number,
                    'walk_in', :subtotal, 0, 0.00, 0.00,
                    :total, 'pending', 'cash', :payment_timing, 'submitted', :notes
                )
            ");

            $orderStmt->execute([
                'order_number'       => $orderNumber,
                'customer_name'      => $guestName,
                'guest_name'         => $guestName,
                'guest_access_token' => $guestAccessToken,
                'idempotency_token'  => $idempotencyToken,
                'table_id'           => $table['id'],
                'table_number'       => $table['table_number'],
                'subtotal'           => $pricing['subtotal'],
                'total'              => $pricing['grand_total'],
                'payment_timing'     => $paymentTiming,
                'notes'              => $orderNotes,
            ]);
            $orderId = (int) $db->lastInsertId();

            // 9. Insert Order Items
            OrderRepository::createOrderItems($orderId, $itemsToProcess);

            // 10. Deduct Inventory Immediately to Reserve Food via InventoryService
            InventoryService::deductStock($itemsToProcess, "QR_ORDER_{$orderNumber}", 1);

            // 11. Mark table as occupied
            $db->prepare("UPDATE restaurant_tables SET current_state = 'occupied', updated_at = NOW() WHERE id = :id")->execute(['id' => $table['id']]);

            $db->commit();

            // 12. Notify Cashier Instantly
            try {
                NotificationService::toRole(
                    ROLE_CASHIER,
                    'New Table Order',
                    "{$table['table_number']} ({$guestName}) placed order {$orderNumber}. Total: ₦" . number_format($pricing['grand_total'], 2),
                    NOTIFY_ORDER
                );
            } catch (\Throwable $ne) {
                error_log("Failed to send cashier notification for QR order: " . $ne->getMessage());
            }

            return [
                'success' => true,
                'message' => "Order submitted successfully! Cashier is reviewing your order.",
                'data'    => [
                    'order_id'           => $orderId,
                    'order_number'       => $orderNumber,
                    'table_number'       => $table['table_number'],
                    'guest_access_token' => $guestAccessToken,
                    'tracking_url'       => '/q/track/' . $guestAccessToken,
                    'payment_timing'     => $paymentTiming,
                    'total'              => $pricing['grand_total'],
                ],
            ];

        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Get safe live order tracking information for guest.
     * Does not require login or expose internal IDs/staff details.
     */
    public function getTrackedOrder(string $guestAccessToken): array
    {
        $cleanToken = trim($guestAccessToken);
        if (empty($cleanToken) || strlen($cleanToken) > 64) {
            return ['success' => false, 'message' => 'Invalid tracking reference', 'code' => 404];
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("
            SELECT o.id, o.order_number, o.guest_name, o.table_number,
                   o.order_status, o.payment_status, o.payment_timing, o.payment_method,
                   o.subtotal, o.total, o.notes, o.created_at, o.accepted_at, o.served_at,
                   t.name AS table_label
            FROM orders o
            LEFT JOIN restaurant_tables t ON o.table_id = t.id
            WHERE o.guest_access_token = :token
            LIMIT 1
        ");
        $stmt->execute(['token' => $cleanToken]);
        $order = $stmt->fetch();

        if (!$order) {
            return ['success' => false, 'message' => 'Order not found or tracking token expired', 'code' => 404];
        }

        $orderId = (int) $order['id'];
        $itemsBatch = OrderRepository::getOrderItemsBatch([$orderId]);
        $items = $itemsBatch[$orderId] ?? [];

        $sanitizedItems = array_map(function ($item) {
            return [
                'name'       => $item['item_name'],
                'quantity'   => (int) $item['quantity'],
                'unit_price' => (float) $item['unit_price'],
                'subtotal'   => (float) $item['subtotal'],
            ];
        }, $items);

        return [
            'success' => true,
            'data'    => [
                'order_number'   => $order['order_number'],
                'table_number'   => $order['table_number'],
                'table_label'    => $order['table_label'],
                'guest_name'     => $order['guest_name'],
                'order_status'   => $order['order_status'],
                'payment_status' => $order['payment_status'],
                'payment_timing' => $order['payment_timing'],
                'payment_method' => $order['payment_method'],
                'subtotal'       => (float) $order['subtotal'],
                'packaging_fee'  => 0.00,
                'total'          => (float) $order['total'],
                'notes'          => $order['notes'],
                'items'          => $sanitizedItems,
                'can_cancel'     => ($order['order_status'] === 'submitted'),
                'created_at'     => $order['created_at'],
                'accepted_at'    => $order['accepted_at'],
                'served_at'      => $order['served_at'],
            ],
        ];
    }
}
