<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Order Controller
 *
 * Thin controller for order management and workflows.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Services\OrderService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class OrderController
{
    private OrderService $orderService;

    public function __construct()
    {
        $this->orderService = new OrderService();
    }

    /**
     * GET /api/v2/orders — List all orders (Staff).
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('orders.view');

        $params = $_GET;
        $result = $this->orderService->listOrders($params);

        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 50)));

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * GET /api/v2/orders/my-orders — List authenticated customer's orders.
     */
    public function myOrders(): void
    {
        AuthMiddleware::verify();
        $authUser = $_REQUEST['auth_user'];

        $params = $_GET;
        $result = $this->orderService->listCustomerOrders((int) $authUser['id'], $params);

        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 30)));

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * GET /api/v2/orders/active — Active orders for kitchen & cashier screen.
     */
    public function active(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('orders.view');

        $orders = $this->orderService->listActiveOrders();
        Response::success($orders);
    }

    /**
     * GET /api/v2/orders/{id} — Show a single order.
     */
    public function show(int $id): void
    {
        AuthMiddleware::verify();
        $authUser = $_REQUEST['auth_user'];

        $order = $this->orderService->getOrder($id, $authUser);
        if (!$order) {
            Response::notFound('Order not found or access denied');
        }

        Response::success($order);
    }

    /**
     * POST /api/v2/orders — Create a new order.
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        $authUser = $_REQUEST['auth_user'];
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'items', 'Order items')
                  ->isArray($input, 'items', 'Order items')
                  ->required($input, 'order_type', 'Order type')
                  ->inArray($input, 'order_type', ['pickup', 'delivery', 'walk_in', 'takeaway', 'dine_in'], 'Order type')
                  ->required($input, 'payment_method', 'Payment method')
                  ->inArray($input, 'payment_method', ['cash', 'paystack', 'transfer', 'pos'], 'Payment method');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        // Normalize order_type aliases (takeaway/dine_in -> pickup/walk_in if needed)
        if ($input['order_type'] === 'takeaway') {
            $input['order_type'] = 'pickup';
        } elseif ($input['order_type'] === 'dine_in') {
            $input['order_type'] = 'walk_in';
        }

        $result = $this->orderService->createOrder($input, $authUser);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        Response::created($result['data'], $result['message']);
    }

    /**
     * PATCH /api/v2/orders/{id}/status — Update order workflow status.
     */
    public function updateStatus(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('orders.update_status');

        $authUser = $_REQUEST['auth_user'];
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'status', 'Status')
                  ->inArray($input, 'status', ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'received'], 'Status');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $status = $input['status'];
        // Normalize 'received' -> 'accepted'
        if ($status === 'received') {
            $status = 'accepted';
        }

        $result = $this->orderService->updateOrderStatus($id, $status, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success($result['data'] ?? null, $result['message']);
    }

    /**
     * DELETE /api/v2/orders/{id} — Delete an order.
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('orders.delete');

        $authUser = $_REQUEST['auth_user'];
        $result = $this->orderService->deleteOrder($id, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success(null, $result['message']);
    }

    /**
     * POST /api/v2/orders/{id}/accept — Cashier accepts order (sending to kitchen).
     */
    public function accept(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $authUser = $_REQUEST['auth_user'];
        $result = $this->orderService->acceptOrder($id, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * POST /api/v2/orders/{id}/reject — Cashier rejects order.
     */
    public function reject(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $authUser = $_REQUEST['auth_user'];
        $input = $_REQUEST['json_input'] ?? [];
        $reason = trim((string) ($input['reason'] ?? $input['rejection_reason'] ?? 'Rejected by staff'));

        $result = $this->orderService->rejectOrder($id, $reason, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * POST /api/v2/orders/{id}/served — Mark order as served.
     */
    public function served(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $authUser = $_REQUEST['auth_user'];
        $result = $this->orderService->markServed($id, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * POST /api/v2/orders/{id}/payment — Record payment for order.
     */
    public function recordPayment(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $authUser = $_REQUEST['auth_user'];
        $input = $_REQUEST['json_input'] ?? [];

        $method = $input['payment_method'] ?? 'cash';
        $amount = (float) ($input['amount'] ?? 0.00);

        $result = $this->orderService->recordPayment($id, $method, $amount, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
            return;
        }

        Response::success($result['data'], $result['message']);
    }

    /**
     * GET /api/v2/cashier/dashboard-summary — Operational counters for cashier orders queue.
     */
    public function dashboardSummary(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole([ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER]);

        $summary = $this->orderService->getDashboardSummary();
        Response::success($summary, 'Dashboard summary loaded');
    }
}
