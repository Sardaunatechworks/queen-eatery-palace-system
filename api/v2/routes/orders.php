<?php
/**
 * Orders & Payments Routes — /api/v2/orders/*, /api/v2/payments/*
 */

// ============================================
// ORDERS
// ============================================

route('GET', '/orders', function () {
    (new \App\Controllers\OrderController())->index();
});

route('GET', '/orders/my-orders', function () {
    (new \App\Controllers\OrderController())->myOrders();
});

route('GET', '/orders/active', function () {
    (new \App\Controllers\OrderController())->active();
});

route('GET', '/orders/pending', function () {
    (new \App\Controllers\OrderController())->active();
});

route('GET', '/orders/dashboard-summary', function () {
    (new \App\Controllers\OrderController())->dashboardSummary();
});

route('GET', '/cashier/dashboard-summary', function () {
    (new \App\Controllers\OrderController())->dashboardSummary();
});

route('GET', '/orders/{id}', function (array $params) {
    (new \App\Controllers\OrderController())->show((int) $params['id']);
});

route('POST', '/orders', function () {
    (new \App\Controllers\OrderController())->create();
});

route('PATCH', '/orders/{id}/status', function (array $params) {
    (new \App\Controllers\OrderController())->updateStatus((int) $params['id']);
});

route('POST', '/orders/{id}/accept', function (array $params) {
    (new \App\Controllers\OrderController())->accept((int) $params['id']);
});

route('POST', '/orders/{id}/reject', function (array $params) {
    (new \App\Controllers\OrderController())->reject((int) $params['id']);
});

route('POST', '/orders/{id}/served', function (array $params) {
    (new \App\Controllers\OrderController())->served((int) $params['id']);
});

route('POST', '/orders/{id}/payment', function (array $params) {
    (new \App\Controllers\OrderController())->recordPayment((int) $params['id']);
});

route('DELETE', '/orders/{id}', function (array $params) {
    (new \App\Controllers\OrderController())->delete((int) $params['id']);
});

// ============================================
// PAYMENTS & TRANSACTIONS
// ============================================

route('POST', '/payments/verify', function () {
    (new \App\Controllers\PaymentController())->verify();
});

route('GET', '/payments/transactions', function () {
    (new \App\Controllers\PaymentController())->transactions();
});

route('POST', '/payments/webhook', function () {
    (new \App\Controllers\PaymentController())->webhook();
});
