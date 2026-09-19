<?php
/**
 * System Settings Route Definitions
 */

declare(strict_types=1);

use App\Controllers\SettingController;

// GET /settings/pricing — Retrieve takeaway pack unit price
route('GET', '/settings/pricing', function () {
    (new SettingController())->getPricingSettings();
});

// PATCH /settings/pricing — Update takeaway pack unit price (Admin only)
route('PATCH', '/settings/pricing', function () {
    (new SettingController())->updatePricingSettings();
});

// PUT /settings/pricing — Also support PUT for flexibility
route('PUT', '/settings/pricing', function () {
    (new SettingController())->updatePricingSettings();
});
