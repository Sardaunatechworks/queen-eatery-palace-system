<?php
/**
 * Queen's Palace Eatery & Event Hall - Guest QR Ordering Routes
 *
 * /api/qr/* and /api/v2/qr/*
 */

declare(strict_types=1);

// Anonymous table validation
route('GET', '/qr/table/{token}', function (array $params) {
    (new \App\Controllers\GuestQRController())->validateTable($params['token']);
});

// Available menu for QR table ordering
route('GET', '/qr/menu/{token}', function (array $params) {
    (new \App\Controllers\GuestQRController())->getMenu($params['token']);
});

// Submit anonymous guest table order
route('POST', '/qr/orders', function () {
    (new \App\Controllers\GuestQRController())->submitOrder();
});

// Anonymous live order tracking
route('GET', '/qr/orders/track/{guestToken}', function (array $params) {
    (new \App\Controllers\GuestQRController())->trackOrder($params['guestToken']);
});
