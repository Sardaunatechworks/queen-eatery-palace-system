<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Order Service
 *
 * Orchestrates order placement with pessimistic stock locking,
 * transactional inventory deduction, payment verification, and order workflow.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Repositories\OrderRepository;
use App\Repositories\TransactionRepository;
use App\Repositories\InventoryRepository;
use App\Repositories\MenuRepository;
use App\Helpers\Sanitizer;

class OrderService
{
    private PaystackService $paystackService;

    public function __construct(?PaystackService $paystackService = null)
    {
        $this->paystackService = $paystackService ?? new PaystackService();
    }

    /**
     * Create an order with transactional row-locking on inventory.
     *
     * @param array $input Order payload containing items, order_type, payment_method, etc.
     * @param array $authUser Authenticated user placing the order.
     * @return array
     */
    public function createOrder(array $input, array $authUser): array
    {
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $itemsInput = $input['items'] ?? [];
            if (empty($itemsInput) || !is_array($itemsInput)) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order must contain at least one item'];
            }

            $totalAmount = 0.00;
            $itemsToProcess = [];

            // 1. Pessimistic row locking: Lock menu items & inventory
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
                    return ['success' => false, 'message' => "Menu item not found: ID {$menuItemId}"];
                }

                if ($menuItem['status'] === 'disabled') {
                    $db->rollBack();
                    return ['success' => false, 'message' => "Item '{$menuItem['name']}' is currently unavailable"];
                }

                if ($menuItem['approval_status'] !== 'approved') {
                    $db->rollBack();
                    return ['success' => false, 'message' => "Item '{$menuItem['name']}' has not been approved"];
                }

                // If item tracks inventory, enforce stock limit
                if ((bool) ($menuItem['track_inventory'] ?? true)) {
                    $availableStock = (float) $menuItem['quantity_available'];
                    if ($availableStock < $qtyOrdered) {
                        $db->rollBack();
                        return [
                            'success' => false,
                            'message' => "Insufficient stock for '{$menuItem['name']}'. Available: {$availableStock}, requested: {$qtyOrdered}",
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
                    'requires_packaging' => (bool) ($menuItem['requires_packaging'] ?? true),
                    'notes'              => isset($itemInput['notes']) ? Sanitizer::clean($itemInput['notes']) : null,
                ];
            }

            // 2. Generate sequential order number
            $orderNumber = OrderRepository::getNextOrderNumber();

            // 3. Determine order origin and initial statuses
            $isCashier = in_array(
                $authUser['role_name'] ?? '',
                [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER],
                true
            );

            $source = $isCashier && !empty($input['source']) ? $input['source'] : ($isCashier ? 'cashier' : 'online_customer');
            $customerId = null;
            $cashierId = null;

            if ($source === 'cashier') {
                $cashierId = (int) $authUser['id'];
                $customerId = !empty($input['customer_id']) ? (int) $input['customer_id'] : null;
            } else {
                $customerId = (int) $authUser['id'];
            }

            $paymentMethod = $input['payment_method'] ?? 'cash';
            $isCashierOrder = ($source === 'cashier');
            $isImmediatePayment = $isCashierOrder || in_array($paymentMethod, ['cash', 'pos', 'transfer', 'bank_transfer'], true);

            // Counter orders at cashier register or immediate payment methods start as 'accepted' and 'paid'.
            $orderStatus = $isImmediatePayment ? 'accepted' : 'pending';
            $paymentStatus = $isImmediatePayment ? 'paid' : 'pending';

            // Authoritative Pricing Calculation via PricingService
            $explicitPackaging = isset($input['packaging_quantity']) ? (int) $input['packaging_quantity'] : null;
            $deliveryFee = isset($input['delivery_fee']) ? (float) $input['delivery_fee'] : 0.00;
            $discountAmount = isset($input['discount_amount']) ? (float) $input['discount_amount'] : 0.00;

            $pricing = PricingService::calculateOrderTotals(
                $itemsToProcess,
                $source,
                $explicitPackaging,
                $deliveryFee,
                $discountAmount
            );

            // 4. Insert Order Header with immutable packaging snapshot
            $orderId = OrderRepository::create([
                'order_number'         => $orderNumber,
                'customer_id'          => $customerId,
                'cashier_id'           => $cashierId,
                'customer_name'        => Sanitizer::clean($input['customer_name'] ?? $authUser['name'] ?? 'Counter Customer'),
                'customer_phone'       => Sanitizer::clean($input['customer_phone'] ?? $authUser['phone'] ?? ''),
                'source'               => $source,
                'order_type'           => $input['order_type'] ?? 'pickup',
                'subtotal'             => $pricing['subtotal'],
                'packaging_quantity'   => $pricing['packaging_quantity'],
                'packaging_unit_price' => $pricing['packaging_unit_price'],
                'packaging_fee'        => $pricing['packaging_fee'],
                'delivery_fee'         => $pricing['delivery_fee'],
                'discount_amount'      => $pricing['discount_amount'],
                'total'                => $pricing['grand_total'],
                'payment_status'       => $paymentStatus,
                'payment_method'       => $paymentMethod,
                'order_status'         => $orderStatus,
                'delivery_address'     => isset($input['delivery_address']) ? Sanitizer::clean($input['delivery_address']) : null,
                'notes'                => isset($input['notes']) ? Sanitizer::clean($input['notes']) : null,
            ]);

            // 5. Insert Order Items
            OrderRepository::createOrderItems($orderId, $itemsToProcess);

            // 6. Deduct inventory & record stock movements via InventoryService
            $deductResult = InventoryService::deductStock($itemsToProcess, "ORDER_{$orderNumber}", (int) $authUser['id']);
            $lowStockTriggered = $deductResult['low_stock_triggered'] ?? [];

            // 7. If paid immediately (Cash/POS/Transfer at counter), insert transaction
            if ($isImmediatePayment) {
                $refPrefix = strtoupper($paymentMethod);
                $payRef = $refPrefix . '_' . bin2hex(random_bytes(6));
                TransactionRepository::create(
                    $orderId,
                    $payRef,
                    $pricing['grand_total'],
                    $paymentMethod,
                    'success',
                    $isCashierOrder ? 'cashier' : 'counter',
                    date('Y-m-d H:i:s')
                );
            }

            $db->commit();

            // 8. Notifications & Audit Logs (post-commit)
            try {
                // Counter orders created directly by cashier notify the kitchen, NOT the cashier!
                // Online customer orders notify the cashier once paid and verified.
                if ($isCashierOrder) {
                    NotificationService::toRole(
                        ROLE_KITCHEN,
                        'New Counter Order',
                        "Order {$orderNumber} placed at counter. Total: ₦" . number_format($pricing['grand_total'], 2),
                        NOTIFY_ORDER
                    );
                } else if (!in_array($source, ['online_customer', 'customer'], true) || $paymentStatus === 'paid') {
                    NotificationService::orderReceived($orderNumber, $pricing['grand_total']);
                }

                foreach ($lowStockTriggered as $ls) {
                    NotificationService::lowStockAlert($ls['name'], $ls['qty'], $ls['threshold']);
                }

                AuditService::orderCreated($orderId, $orderNumber);
            } catch (\Throwable $ne) {
                error_log("Post-order notification/audit error: " . $ne->getMessage());
            }

            return [
                'success' => true,
                'message' => 'Order placed successfully',
                'data'    => [
                    'id'                   => $orderId,
                    'order_id'             => (string) $orderId,
                    'order_number'         => $orderNumber,
                    'orderNumber'          => $orderNumber,
                    'subtotal'             => $pricing['subtotal'],
                    'packaging_quantity'   => $pricing['packaging_quantity'],
                    'packaging_unit_price' => $pricing['packaging_unit_price'],
                    'packaging_fee'        => $pricing['packaging_fee'],
                    'total'                => $pricing['grand_total'],
                    'total_amount'         => $pricing['grand_total'],
                    'order_status'         => $orderStatus,
                    'status'               => $orderStatus,
                    'payment_status'       => $paymentStatus,
                    'payment_method'       => $paymentMethod,
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
     * Update order workflow status with inventory restoration upon cancellation.
     */
    public function updateOrderStatus(int $orderId, string $newStatus, array $authUser): array
    {
        $validStatuses = ['submitted', 'pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'rejected'];
        if (!in_array($newStatus, $validStatuses, true)) {
            return ['success' => false, 'message' => "Invalid order status '{$newStatus}'"];
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order not found', 'code' => 404];
            }

            $oldStatus = $order['order_status'];

            if ($oldStatus === 'completed' || $oldStatus === 'cancelled' || $oldStatus === 'rejected') {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => "Cannot change status of a {$oldStatus} order",
                    'code'    => 400,
                ];
            }

            // Enforce state consistency: cannot complete order without payment
            if ($newStatus === 'completed' && ($order['payment_status'] ?? '') !== 'paid') {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => 'Cannot complete an order with pending payment. Payment must be recorded first.',
                    'code'    => 400,
                ];
            }

            // Update status
            OrderRepository::updateStatus($orderId, $newStatus);

            // If cancelled or rejected, restore stock
            if ($newStatus === 'cancelled' || $newStatus === 'rejected') {
                $itemsBatch = OrderRepository::getOrderItemsBatch([$orderId]);
                $orderItems = $itemsBatch[$orderId] ?? [];

                foreach ($orderItems as $item) {
                    $mId = (int) $item['menu_item_id'];
                    $qty = (int) $item['quantity'];

                    if ($mId > 0 && $qty > 0) {
                        // Restore menu_items
                        $db->prepare('
                            UPDATE menu_items
                            SET quantity_available = quantity_available + :qty,
                                status = "available"
                            WHERE id = :id AND status != "disabled"
                        ')->execute(['qty' => $qty, 'id' => $mId]);

                        // Restore inventory table
                        $inv = InventoryRepository::findByMenuItemIdForUpdate($mId);
                        if ($inv) {
                            $newInvQty = $inv['quantity'] + $qty;
                            InventoryRepository::updateQuantity($inv['id'], $newInvQty, (int) $authUser['id']);

                            // Log stock movement
                            InventoryRepository::createStockMovement(
                                $inv['id'],
                                'add',
                                $qty,
                                "RESTORE_{$order['order_number']}",
                                (int) $authUser['id']
                            );
                        }
                    }
                }
            }

            $db->commit();

            try {
                // When order is marked preparing, notify cashier and admin
                if ($newStatus === 'preparing') {
                    $tableInfo = !empty($order['table_number']) ? " ({$order['table_number']})" : "";
                    NotificationService::toRole(
                        ROLE_CASHIER,
                        'Kitchen Started Preparing Order',
                        "Kitchen staff has started preparing Order #{$order['order_number']}{$tableInfo}.",
                        NOTIFY_ORDER
                    );
                    NotificationService::toRole(
                        ROLE_ADMIN,
                        'Kitchen Started Preparing Order',
                        "Kitchen staff has started preparing Order #{$order['order_number']}{$tableInfo}.",
                        NOTIFY_ORDER
                    );
                }

                // When order is marked ready, notify cashier for pickup/delivery handover
                if ($newStatus === 'ready') {
                    $tableInfo = !empty($order['table_number']) ? " ({$order['table_number']})" : "";
                    NotificationService::toRole(
                        ROLE_CASHIER,
                        'Order Ready for Handover',
                        "Order #{$order['order_number']}{$tableInfo} is ready for pickup / fulfillment.",
                        NOTIFY_ORDER
                    );
                    NotificationService::toRole(
                        ROLE_ADMIN,
                        'Order Ready for Handover',
                        "Order #{$order['order_number']}{$tableInfo} is ready for pickup / fulfillment.",
                        NOTIFY_ORDER
                    );
                    if (!empty($order['table_number'])) {
                        NotificationService::tableOrderReady($order['table_number'], $order['order_number']);
                    }
                }

                // Notify customer if associated
                if (!empty($order['customer_id'])) {
                    $statusUpper = strtoupper($newStatus);
                    NotificationService::toUser(
                        (int) $order['customer_id'],
                        'Order Status Updated',
                        "Your order {$order['order_number']} is now {$statusUpper}.",
                        NOTIFY_ORDER
                    );
                }

                AuditService::orderStatusChanged($orderId, $oldStatus, $newStatus);
            } catch (\Throwable $ne) {
                error_log("Post-order status notification error: " . $ne->getMessage());
            }

            return [
                'success' => true,
                'message' => "Order marked as {$newStatus}",
                'data'    => [
                    'order_id'     => $orderId,
                    'order_number' => $order['order_number'],
                    'old_status'   => $oldStatus,
                    'new_status'   => $newStatus,
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
     * Cashier accepts an incoming order (submitted / pending -> accepted).
     * Only after acceptance does the order move to the Kitchen screen.
     */
    public function acceptOrder(int $orderId, array $authUser): array
    {
        $cashierId = (int) $authUser['id'];
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order not found', 'code' => 404];
            }

            if (!in_array($order['order_status'], ['submitted', 'pending'], true)) {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => "Order is already {$order['order_status']}",
                    'code'    => 400,
                ];
            }

            OrderRepository::acceptOrder($orderId, $cashierId);
            $db->commit();

            try {
                // Notify Kitchen of newly accepted order with table details if present
                $tableInfo = !empty($order['table_number']) ? " (Table {$order['table_number']})" : "";
                NotificationService::toRole(
                    ROLE_KITCHEN,
                    'New Order Accepted - Prepare Now',
                    "Order #{$order['order_number']}{$tableInfo} has been accepted by cashier and is ready for kitchen preparation.",
                    NOTIFY_ORDER
                );

                // Notify Customer that order has been confirmed
                if (!empty($order['customer_id'])) {
                    NotificationService::toUser(
                        (int) $order['customer_id'],
                        'Order Confirmed',
                        "Your order #{$order['order_number']} has been confirmed by the restaurant and sent to the kitchen.",
                        NOTIFY_ORDER
                    );
                }

                AuditService::log('order.accept', 'order', (string)$orderId, "Accepted order {$order['order_number']}");
            } catch (\Throwable $e) {
                error_log("Post-order accept notification error: " . $e->getMessage());
            }

            return [
                'success' => true,
                'message' => "Order {$order['order_number']} accepted and sent to Kitchen",
                'data'    => [
                    'order_id'     => $orderId,
                    'order_number' => $order['order_number'],
                    'status'       => 'accepted',
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
     * Cashier rejects an incoming order (submitted / pending -> rejected) with inventory restoration.
     */
    public function rejectOrder(int $orderId, string $reason, array $authUser): array
    {
        $cashierId = (int) $authUser['id'];
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order not found', 'code' => 404];
            }

            if (!in_array($order['order_status'], ['submitted', 'pending'], true)) {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => "Cannot reject order in status '{$order['order_status']}'",
                    'code'    => 400,
                ];
            }

            OrderRepository::rejectOrder($orderId, $cashierId, $reason);

            // Restore reserved inventory via InventoryService
            $itemsBatch = OrderRepository::getOrderItemsBatch([$orderId]);
            $orderItems = $itemsBatch[$orderId] ?? [];
            InventoryService::restoreStock($orderItems, "REJECT_{$order['order_number']}", $cashierId);

            $db->commit();

            try {
                AuditService::create($cashierId, 'order.reject', 'orders', $orderId, "Rejected order {$order['order_number']}: {$reason}");
            } catch (\Throwable $e) {}

            return [
                'success' => true,
                'message' => "Order {$order['order_number']} has been rejected and inventory restored",
                'data'    => [
                    'order_id'     => $orderId,
                    'order_number' => $order['order_number'],
                    'status'       => 'rejected',
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
     * Mark order as served to the table or customer.
     */
    public function markServed(int $orderId, array $authUser): array
    {
        $staffId = (int) $authUser['id'];
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order not found', 'code' => 404];
            }

            OrderRepository::markServed($orderId);

            // If already paid, order is completed
            if ($order['payment_status'] === 'paid') {
                OrderRepository::updateStatus($orderId, 'completed');
            }

            $db->commit();

            try {
                AuditService::create($staffId, 'order.served', 'orders', $orderId, "Marked order {$order['order_number']} as served");
            } catch (\Throwable $e) {}

            return [
                'success' => true,
                'message' => "Order {$order['order_number']} marked as served",
                'data'    => [
                    'order_id'     => $orderId,
                    'order_number' => $order['order_number'],
                    'status'       => $order['payment_status'] === 'paid' ? 'completed' : 'served',
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
     * Record payment for an order (e.g. Pay After Meal via cash, pos, transfer).
     */
    public function recordPayment(int $orderId, string $method, float $amount, array $authUser): array
    {
        $cashierId = (int) $authUser['id'];
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Order not found', 'code' => 404];
            }

            // Create transaction record
            $ref = strtoupper($method) . '_' . bin2hex(random_bytes(6));
            TransactionRepository::create(
                $orderId,
                $ref,
                $amount > 0 ? $amount : (float) $order['total'],
                $method,
                'success',
                'cashier',
                date('Y-m-d H:i:s')
            );

            // Update order payment status
            OrderRepository::updatePaymentStatus($orderId, 'paid', $method);

            // If order was already served, complete it
            if ($order['order_status'] === 'served') {
                OrderRepository::updateStatus($orderId, 'completed');
            }

            $db->commit();

            try {
                AuditService::create($cashierId, 'order.payment', 'orders', $orderId, "Recorded payment for {$order['order_number']} via {$method}");
            } catch (\Throwable $e) {}

            return [
                'success' => true,
                'message' => "Payment recorded successfully for order {$order['order_number']}",
                'data'    => [
                    'order_id'       => $orderId,
                    'payment_status' => 'paid',
                    'payment_method' => $method,
                    'order_status'   => $order['order_status'] === 'served' ? 'completed' : $order['order_status'],
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
     * Verify Paystack payment transaction and finalize order.
     */
    public function verifyPayment(string $reference, int $orderId, array $authUser): array
    {
        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $order = OrderRepository::findWithLock($orderId);
            if (!$order) {
                $db->rollBack();
                return ['success' => false, 'message' => 'Associated order not found', 'code' => 404];
            }

            // If already paid, return success idempotently
            if ($order['payment_status'] === 'paid') {
                $db->commit();
                return [
                    'success' => true,
                    'message' => 'Payment already verified',
                    'data'    => [
                        'order_id'       => (string) $orderId,
                        'payment_status' => 'paid',
                        'order_status'   => $order['order_status'],
                    ],
                ];
            }

            // Verify with Paystack API
            $payResult = $this->paystackService->verifyTransaction($reference);
            if (!$payResult['success']) {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => $payResult['message'],
                    'code'    => 400,
                ];
            }

            // Recalculate expected order grand total independently
            $expectedAmount = PricingService::recalculateExistingOrderExpectedTotal($order);
            $actualAmount = (float) $payResult['amount'];

            if (abs($expectedAmount - $actualAmount) > 0.05) {
                $db->rollBack();
                return [
                    'success' => false,
                    'message' => "Payment amount mismatch. Expected: ₦{$expectedAmount}, Received: ₦{$actualAmount}",
                    'code'    => 400,
                ];
            }

            // Insert or update transaction record (idempotent)
            $existingTx = TransactionRepository::findByReference($reference);
            if ($existingTx) {
                TransactionRepository::updateStatus($reference, 'success', date('Y-m-d H:i:s'));
            } else {
                TransactionRepository::create(
                    $orderId,
                    $reference,
                    $actualAmount,
                    'paystack',
                    'success',
                    'paystack',
                    date('Y-m-d H:i:s')
                );
            }

            // Update order payment status and transition order to 'submitted'
            OrderRepository::updatePaymentStatus($orderId, 'paid', 'paystack');

            // CRITICAL: A verified paid online order enters the cashier's active queue in 'submitted' status!
            // It MUST NOT advance to 'accepted' until reviewed and accepted by the cashier.
            OrderRepository::updateStatus($orderId, 'submitted');

            $db->commit();

            try {
                // Online customer order is now paid and verified: create in-app notification targeted at Cashier (Requirement 10)
                $custDisplayName = $order['customer_name'] ?? 'Customer';
                NotificationService::toRole(
                    ROLE_CASHIER,
                    'New Paid Online Order',
                    "Online order #{$order['order_number']} by {$custDisplayName} has been paid (₦" . number_format($actualAmount, 2) . ") and verified. Ready for cashier review.",
                    NOTIFY_ORDER
                );
                NotificationService::paymentReceived($order['order_number'], $actualAmount, 'paystack');
                AuditService::paymentVerified($orderId, $reference, $actualAmount);
            } catch (\Throwable $ne) {
                error_log("Post-payment notification error: " . $ne->getMessage());
            }

            return [
                'success' => true,
                'message' => 'Payment verified and order submitted to cashier for review',
                'data'    => [
                    'order_id'       => (string) $orderId,
                    'order_number'   => $order['order_number'],
                    'payment_status' => 'paid',
                    'order_status'   => 'submitted',
                    'total'          => $actualAmount,
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
     * Get single order by ID with permission enforcement.
     */
    public function getOrder(int $orderId, ?array $authUser): ?array
    {
        $order = OrderRepository::findById($orderId);
        if (!$order) {
            return null;
        }

        // Customer can only view their own order
        if ($authUser && ($authUser['role_name'] ?? '') === ROLE_CUSTOMER) {
            if ((int) $order['customer_id'] !== (int) $authUser['id']) {
                return null;
            }
        }

        $itemsBatch = OrderRepository::getOrderItemsBatch([$orderId]);
        $order['items'] = $itemsBatch[$orderId] ?? [];
        $order['transactions'] = TransactionRepository::findByOrderId($orderId);

        return $order;
    }

    /**
     * List paginated orders for staff.
     */
    public function listOrders(array $params): array
    {
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 50)));

        $result = OrderRepository::list($page, $perPage, $params);

        if (!empty($result['data'])) {
            $orderIds = array_column($result['data'], 'id');
            $itemsBatch = OrderRepository::getOrderItemsBatch($orderIds);

            foreach ($result['data'] as &$order) {
                $order['items'] = $itemsBatch[$order['id']] ?? [];
            }
        }

        return $result;
    }

    /**
     * List active workflow orders (kitchen & cashier screen).
     */
    public function listActiveOrders(): array
    {
        $orders = OrderRepository::findActiveOrders();

        if (!empty($orders)) {
            $orderIds = array_column($orders, 'id');
            $itemsBatch = OrderRepository::getOrderItemsBatch($orderIds);

            foreach ($orders as &$order) {
                $order['items'] = $itemsBatch[$order['id']] ?? [];
            }
        }

        return $orders;
    }

    /**
     * List customer's own order history.
     */
    public function listCustomerOrders(int $customerId, array $params): array
    {
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 30)));

        $result = OrderRepository::findCustomerOrders($customerId, $page, $perPage);

        if (!empty($result['data'])) {
            $orderIds = array_column($result['data'], 'id');
            $itemsBatch = OrderRepository::getOrderItemsBatch($orderIds);

            foreach ($result['data'] as &$order) {
                $order['items'] = $itemsBatch[$order['id']] ?? [];
            }
        }

        return $result;
    }

    /**
     * Delete an order.
     */
    public function deleteOrder(int $orderId, array $authUser): array
    {
        $order = OrderRepository::findById($orderId);
        if (!$order) {
            return ['success' => false, 'message' => 'Order not found', 'code' => 404];
        }

        OrderRepository::delete($orderId);
        AuditService::log('order.deleted', 'order', (string) $orderId, "Deleted order {$order['order_number']}");

        return ['success' => true, 'message' => 'Order deleted successfully'];
    }

    /**
     * List transactions with filters.
     */
    public function listTransactions(array $params): array
    {
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 50)));

        return TransactionRepository::list($page, $perPage, $params);
    }

    /**
     * Single query operational summary for Cashier dashboard counters.
     */
    public function getDashboardSummary(): array
    {
        return OrderRepository::getDashboardSummary();
    }
}
