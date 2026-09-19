<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Auth Controller
 *
 * Thin controller — delegates all business logic to AuthService.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Services\AuthService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimiter;

class AuthController
{
    private AuthService $authService;

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    /**
     * POST /api/v2/auth/login
     */
    public function login(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $email = !empty($input['email']) ? (string) $input['email'] : null;
        RateLimiter::checkAuth($email);

        $validator = new Validator();
        $validator->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $result = $this->authService->login($input['email'], $input['password']);

        if (!$result['success']) {
            Response::error($result['message'], 401);
        }

        // Log successful login
        AuditService::userLogin(
            (int) $result['data']['profile']['uid'],
            $result['data']['profile']['name']
        );

        $access = (string) ($result['data']['accessToken'] ?? '');
        $refresh = (string) ($result['data']['refreshToken'] ?? '');
        $expiresIn = (int) ($result['data']['expiresIn'] ?? 900);

        // Set Secure, HttpOnly Authentication Cookies
        \App\Helpers\CookieHelper::setAuthCookies($access, $refresh, $expiresIn);

        // Strip raw tokens from JSON response body to prevent browser storage exposure
        $responseBody = [
            'profile'   => $result['data']['profile'],
            'expiresIn' => $expiresIn,
        ];

        Response::success($responseBody, 'Login successful');
    }

    /**
     * POST /api/v2/auth/signup
     */
    public function signup(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $email = !empty($input['email']) ? (string) $input['email'] : null;
        RateLimiter::checkAuth($email);

        $validator = new Validator();
        $validator->required($input, 'full_name', 'Full name')
                  ->minLength($input, 'full_name', 2, 'Full name')
                  ->maxLength($input, 'full_name', 100, 'Full name')
                  ->required($input, 'email')
                  ->email($input, 'email')
                  ->required($input, 'password')
                  ->minLength($input, 'password', 8, 'Password');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $result = $this->authService->signup($input);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        $access = (string) ($result['data']['accessToken'] ?? '');
        $refresh = (string) ($result['data']['refreshToken'] ?? '');
        $expiresIn = (int) ($result['data']['expiresIn'] ?? 900);

        // Set Secure, HttpOnly Authentication Cookies
        \App\Helpers\CookieHelper::setAuthCookies($access, $refresh, $expiresIn);

        $responseBody = [
            'profile'   => $result['data']['profile'],
            'expiresIn' => $expiresIn,
        ];

        Response::created($responseBody, 'Account created successfully');
    }

    /**
     * POST /api/v2/auth/refresh
     */
    public function refresh(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $refreshToken = $_COOKIE[\App\Helpers\CookieHelper::REFRESH_COOKIE] ?? $input['refreshToken'] ?? '';

        if (empty($refreshToken)) {
            Response::unauthorized('Refresh token missing');
        }

        $result = $this->authService->refresh($refreshToken);

        if (!$result['success']) {
            \App\Helpers\CookieHelper::clearAuthCookies();
            Response::unauthorized($result['message']);
        }

        $access = (string) ($result['data']['accessToken'] ?? '');
        $expiresIn = (int) ($result['data']['expiresIn'] ?? 900);

        // Refresh access cookie while preserving existing refresh cookie
        \App\Helpers\CookieHelper::setAuthCookies($access, $refreshToken, $expiresIn);

        $responseBody = [
            'profile'   => $result['data']['profile'],
            'expiresIn' => $expiresIn,
        ];

        Response::success($responseBody, 'Token refreshed');
    }

    /**
     * POST /api/v2/auth/logout
     */
    public function logout(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $refreshToken = $_COOKIE[\App\Helpers\CookieHelper::REFRESH_COOKIE] ?? $input['refreshToken'] ?? '';

        if (!empty($refreshToken)) {
            $this->authService->logout($refreshToken);
        }

        // Invalidate and clear all authentication cookies
        \App\Helpers\CookieHelper::clearAuthCookies();

        Response::success(null, 'Logged out successfully');
    }

    /**
     * POST /api/v2/auth/forgot-password
     */
    public function forgotPassword(): void
    {
        $input = $_REQUEST['json_input'] ?? [];
        $email = !empty($input['email']) ? (string) $input['email'] : null;
        RateLimiter::checkAuth($email);

        $validator = new Validator();
        $validator->required($input, 'email')
                  ->email($input, 'email');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $result = $this->authService->initiatePasswordReset($input['email']);

        // TODO: Send email with reset link via MailService
        // if (isset($result['_token'])) {
        //     MailService::sendPasswordReset($result['_email'], $result['_name'], $result['_token']);
        // }

        Response::success(null, $result['message']);
    }

    /**
     * POST /api/v2/auth/reset-password
     */
    public function resetPassword(): void
    {
        RateLimiter::checkAuth();

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'token', 'Reset token')
                  ->required($input, 'password', 'New password')
                  ->minLength($input, 'password', 8, 'New password');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $result = $this->authService->resetPassword($input['token'], $input['password']);

        if (!$result['success']) {
            Response::error($result['message'], 400);
        }

        Response::success(null, $result['message']);
    }

    /**
     * GET /api/v2/auth/me
     */
    public function me(): void
    {
        AuthMiddleware::verify();
        $authUser = $_REQUEST['auth_user'];

        $result = $this->authService->getProfile($authUser);

        if (!$result['success']) {
            Response::notFound($result['message']);
        }

        Response::success($result['data'], 'Profile retrieved');
    }
}
