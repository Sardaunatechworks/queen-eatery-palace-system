<?php
/**
 * Queen's Palace Eatery & Event Hall - Tables Routes
 *
 * /api/v2/tables/*
 */

declare(strict_types=1);

// List all tables
route('GET', '/tables', function () {
    (new \App\Controllers\TableController())->index();
});

// Create new table
route('POST', '/tables', function () {
    (new \App\Controllers\TableController())->store();
});

// Retrieve single table
route('GET', '/tables/{id}', function (array $params) {
    (new \App\Controllers\TableController())->show((int) $params['id']);
});

// Update table details / status
route('PATCH', '/tables/{id}', function (array $params) {
    (new \App\Controllers\TableController())->update((int) $params['id']);
});

// Regenerate public QR token
route('POST', '/tables/{id}/regenerate-qr', function (array $params) {
    (new \App\Controllers\TableController())->regenerateQr((int) $params['id']);
});

// Get QR code data for table flyer print
route('GET', '/tables/{id}/qr', function (array $params) {
    (new \App\Controllers\TableController())->qrData((int) $params['id']);
});

// Delete table
route('DELETE', '/tables/{id}', function (array $params) {
    (new \App\Controllers\TableController())->destroy((int) $params['id']);
});
