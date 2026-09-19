<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Payment Controller
 *
 * Handles payment verification, transaction listings, and webhooks.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\OrderService;
use App\Services\PaystackService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class PaymentController
{
    private OrderService $orderService;
    private PaystackService $paystackService;

    public function __construct()
    {
        $this->orderService = new OrderService();
        $this->paystackService = new PaystackService();
    }

    /**
     * POST /api/v2/payments/verify — Verify Paystack transaction payment.
     */
    public function verify(): void
    {
        AuthMiddleware::optional();
        $authUser = $_REQUEST['auth_user'] ?? [
            'id'        => 0,
            'name'      => 'Customer',
            'role_name' => 'customer',
        ];
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'reference', 'Transaction reference')
                  ->required($input, 'order_id', 'Order ID');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $reference = Sanitizer::clean($input['reference']);
        $orderId = (int) $input['order_id'];

        $result = $this->orderService->verifyPayment($reference, $orderId, $authUser);

        if (!$result['success']) {
            $code = $result['code'] ?? 400;
            Response::error($result['message'], $code);
        }

        Response::success($result['data'] ?? null, $result['message']);
    }

    /**
     * GET /api/v2/payments/transactions — List transactions (Admin/Staff).
     */
    public function transactions(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('transactions.view');

        $params = $_GET;
        $result = $this->orderService->listTransactions($params);

        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(MAX_PAGE_SIZE, max(1, (int) ($params['per_page'] ?? $params['limit'] ?? 50)));

        Response::paginated($result['data'], $result['total'], $page, $perPage);
    }

    /**
     * POST /api/v2/payments/webhook — Paystack Webhook Handler.
     */
    public function webhook(): void
    {
        $signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';
        $rawBody = file_get_contents('php://input');

        if (empty($signature) || !$this->paystackService->verifyWebhookSignature((string) $rawBody, $signature)) {
            Response::unauthorized('Invalid webhook signature');
            return;
        }

        $event = json_decode((string) $rawBody, true);
        if (!$event || empty($event['event'])) {
            Response::error('Invalid webhook payload', 400);
            return;
        }

        if ($event['event'] === 'charge.success') {
            $data = $event['data'] ?? [];
            $reference = $data['reference'] ?? '';
            $orderId = (int) ($data['metadata']['order_id'] ?? 0);

            if (!empty($reference)) {
                if ($orderId <= 0 && !empty($data['metadata']['order_number'])) {
                    $found = \App\Repositories\OrderRepository::findByOrderNumber((string) $data['metadata']['order_number']);
                    if ($found) {
                        $orderId = (int) $found['id'];
                    }
                }

                if ($orderId > 0) {
                    try {
                        $systemUser = [
                            'id'        => 1,
                            'name'      => 'Paystack Webhook',
                            'role_name' => 'system',
                        ];
                        $this->orderService->verifyPayment($reference, $orderId, $systemUser);
                    } catch (\Throwable $e) {
                        error_log('Webhook order processing error: ' . $e->getMessage());
                    }
                }
            }
        }

        // Return 200 OK to Paystack
        Response::success(null, 'Webhook processed successfully');
    }
}
