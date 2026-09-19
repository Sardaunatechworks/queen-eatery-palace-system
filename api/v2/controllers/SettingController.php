<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Setting Controller
 *
 * Handles API endpoints for viewing and updating system settings,
 * including Takeaway Packaging unit price.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Services\PricingService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class SettingController
{
    /**
     * GET /api/v2/settings/pricing
     * Retrieve takeaway packaging unit price and pricing configuration.
     * Public/authenticated so cashiers and online customers can fetch it dynamically.
     */
    public function getPricingSettings(): void
    {
        $packPrice = PricingService::getTakeawayPackPrice();

        Response::success([
            'takeaway_pack_price' => $packPrice,
            'currency'            => 'NGN',
            'symbol'              => '₦',
        ], 'Pricing configuration retrieved');
    }

    /**
     * PATCH /api/v2/settings/pricing
     * Update takeaway pack price (Admin only).
     */
    public function updatePricingSettings(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'takeaway_pack_price', 'Takeaway pack price')
                  ->numeric($input, 'takeaway_pack_price', 'Takeaway pack price');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400, $validator->errors());
        }

        $newPrice = (float) $input['takeaway_pack_price'];
        if ($newPrice < 0) {
            Response::error('Takeaway pack price cannot be negative', 400);
        }

        $authUser = $_REQUEST['auth_user'];
        PricingService::setTakeawayPackPrice($newPrice, (int) $authUser['id']);

        AuditService::log(
            'settings.pricing_update',
            'system_settings',
            'takeaway_pack_price',
            'Updated takeaway pack price to ₦' . number_format($newPrice, 2),
            null,
            ['takeaway_pack_price' => $newPrice]
        );

        Response::success([
            'takeaway_pack_price' => $newPrice,
        ], 'Takeaway pack price updated successfully');
    }
}
