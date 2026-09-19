<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Guest QR Controller
 *
 * Anonymous, rate-limited public endpoints for QR table ordering and tracking.
 * Strictly avoids exposing internal IDs, credentials, or private settings.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\TableService;
use App\Services\GuestOrderService;
use App\Helpers\Response;
use App\Helpers\Validator;

class GuestQRController
{
    private TableService $tableService;
    private GuestOrderService $guestOrderService;

    public function __construct()
    {
        $this->tableService = new TableService();
        $this->guestOrderService = new GuestOrderService();
    }

    /**
     * GET /api/qr/table/{token}
     * Anonymous table validation.
     */
    public function validateTable(string $token): void
    {
        $result = $this->tableService->validatePublicToken($token);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 404);
            return;
        }

        Response::success($result['data']);
    }

    /**
     * GET /api/qr/menu/{token}
     * Available menu items for QR table ordering.
     */
    public function getMenu(string $token): void
    {
        $result = $this->guestOrderService->getGuestMenu($token);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 404);
            return;
        }

        Response::success($result['data']);
    }

    /**
     * POST /api/qr/orders
     * Anonymous guest table order submission.
     */
    public function submitOrder(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        $token = trim((string) ($input['table_token'] ?? $input['token'] ?? ''));
        if (empty($token)) {
            Response::error('Table QR token is required to submit order.', 400);
            return;
        }

        $validator = Validator::make($input, [
            'guest_name' => 'required|min:2|max:100',
            'items'      => 'required|array',
        ]);

        if ($validator->fails()) {
            Response::validationError($validator->errors());
            return;
        }

        $result = $this->guestOrderService->submitOrder($token, $input);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 400);
            return;
        }

        Response::created($result['data'], $result['message']);
    }

    /**
     * GET /api/qr/orders/track/{guestToken}
     * Live anonymous tracking of guest order.
     */
    public function trackOrder(string $guestToken): void
    {
        $result = $this->guestOrderService->getTrackedOrder($guestToken);
        if (!$result['success']) {
            Response::error($result['message'], $result['code'] ?? 404);
            return;
        }

        Response::success($result['data']);
    }
}
