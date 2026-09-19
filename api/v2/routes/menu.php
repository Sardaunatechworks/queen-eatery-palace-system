<?php
/**
 * Menu, Category & Inventory Routes — /api/v2/categories/*, /api/v2/menu/*, /api/v2/inventory/*
 */

// ============================================
// CATEGORIES
// ============================================

route('GET', '/categories', function () {
    (new \App\Controllers\CategoryController())->index();
});

route('POST', '/categories', function () {
    (new \App\Controllers\CategoryController())->create();
});

route('PUT', '/categories/{id}', function (array $params) {
    (new \App\Controllers\CategoryController())->update((int) $params['id']);
});

route('DELETE', '/categories/{id}', function (array $params) {
    (new \App\Controllers\CategoryController())->delete((int) $params['id']);
});

// ============================================
// MENU ITEMS
// ============================================

route('GET', '/menu', function () {
    (new \App\Controllers\MenuController())->index();
});

route('GET', '/menu/{id}', function (array $params) {
    (new \App\Controllers\MenuController())->show((int) $params['id']);
});

route('POST', '/menu', function () {
    (new \App\Controllers\MenuController())->create();
});

route('PUT', '/menu/{id}', function (array $params) {
    (new \App\Controllers\MenuController())->update((int) $params['id']);
});

route('DELETE', '/menu/{id}', function (array $params) {
    (new \App\Controllers\MenuController())->delete((int) $params['id']);
});

route('PATCH', '/menu/{id}/approve', function (array $params) {
    (new \App\Controllers\MenuController())->approve((int) $params['id']);
});

route('PATCH', '/menu/{id}/stock', function (array $params) {
    (new \App\Controllers\MenuController())->updateStock((int) $params['id']);
});

route('POST', '/menu/{id}/image', function (array $params) {
    (new \App\Controllers\MenuController())->uploadImage((int) $params['id']);
});

// ============================================
// INVENTORY
// ============================================

route('GET', '/inventory', function () {
    (new \App\Controllers\InventoryController())->index();
});

// Static sub-routes must be registered BEFORE /inventory/{id} to avoid parameter collisions
route('GET', '/inventory/summary', function () {
    (new \App\Controllers\InventoryController())->summary();
});

route('GET', '/inventory/movements', function () {
    (new \App\Controllers\InventoryController())->movements();
});

route('GET', '/inventory/low-stock', function () {
    (new \App\Controllers\InventoryController())->lowStock();
});

route('POST', '/inventory/{id}/stock-in', function (array $params) {
    (new \App\Controllers\InventoryController())->stockIn((int) $params['id']);
});

route('POST', '/inventory/{id}/wastage', function (array $params) {
    (new \App\Controllers\InventoryController())->recordWastage((int) $params['id']);
});

route('POST', '/inventory/{id}/adjust', function (array $params) {
    (new \App\Controllers\InventoryController())->manualAdjust((int) $params['id']);
});

route('PUT', '/inventory/{id}', function (array $params) {
    (new \App\Controllers\InventoryController())->update((int) $params['id']);
});

route('GET', '/inventory/{id}/history', function (array $params) {
    (new \App\Controllers\InventoryController())->stockHistory((int) $params['id']);
});

