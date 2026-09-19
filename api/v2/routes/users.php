<?php
/**
 * User & Staff Routes — /api/v2/users/*, /api/v2/staff/*, /api/v2/roles, /api/v2/permissions
 */

// Users (Admin)
route('GET', '/users', function () {
    (new \App\Controllers\UserController())->index();
});

route('POST', '/users', function () {
    (new \App\Controllers\UserController())->createStaff();
});

route('POST', '/users/create-staff', function () {
    (new \App\Controllers\UserController())->createStaff();
});

route('GET', '/users/{id}', function (array $params) {
    (new \App\Controllers\UserController())->show((int)$params['id']);
});

route('PUT', '/users/{id}', function (array $params) {
    (new \App\Controllers\UserController())->update((int)$params['id']);
});

route('DELETE', '/users/{id}', function (array $params) {
    (new \App\Controllers\UserController())->delete((int)$params['id']);
});

route('PATCH', '/users/{id}/status', function (array $params) {
    (new \App\Controllers\UserController())->updateStatus((int)$params['id']);
});

route('PUT', '/users/{id}/password', function (array $params) {
    (new \App\Controllers\UserController())->changePassword((int)$params['id']);
});

route('PUT', '/users/{id}/permissions', function (array $params) {
    (new \App\Controllers\UserController())->updatePermissions((int)$params['id']);
});

route('PUT', '/staff/{id}/permissions', function (array $params) {
    (new \App\Controllers\UserController())->updatePermissions((int)$params['id']);
});

// Staff
route('GET', '/staff', function () {
    (new \App\Controllers\UserController())->staff();
});

route('POST', '/staff', function () {
    (new \App\Controllers\UserController())->createStaff();
});

// Roles & Permissions
route('GET', '/roles', function () {
    (new \App\Controllers\UserController())->listRoles();
});

route('GET', '/permissions', function () {
    (new \App\Controllers\UserController())->listPermissions();
});

route('GET', '/permissions/grouped', function () {
    (new \App\Controllers\UserController())->listPermissions();
});
