<?php
/**
 * Auth Routes — /api/v2/auth/*
 */

route('POST', '/auth/login', function () {
    (new \App\Controllers\AuthController())->login();
});

route('POST', '/auth/signup', function () {
    (new \App\Controllers\AuthController())->signup();
});

route('POST', '/auth/refresh', function () {
    (new \App\Controllers\AuthController())->refresh();
});

route('POST', '/auth/logout', function () {
    (new \App\Controllers\AuthController())->logout();
});

route('POST', '/auth/forgot-password', function () {
    (new \App\Controllers\AuthController())->forgotPassword();
});

route('POST', '/auth/reset-password', function () {
    (new \App\Controllers\AuthController())->resetPassword();
});

route('GET', '/auth/me', function () {
    (new \App\Controllers\AuthController())->me();
});
