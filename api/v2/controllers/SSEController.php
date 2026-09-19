<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 SSE Controller
 *
 * Implements high-efficiency real-time Server-Sent Events (SSE).
 * Dispatches current state snapshots with browser retry headers and yields immediately,
 * preventing PHP worker exhaustion in development and shared hosting environments.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Repositories\NotificationRepository;
use App\Repositories\OrderRepository;
use App\Services\JWTService;

class SSEController
{
    /**
     * SSE Event Stream for live active orders (POS, Cashier, Kitchen, Admin).
     * Reconnects every 5 seconds (per Requirement 13).
     * GET /api/v2/sse/orders?token=...
     */
    public function orders(): void
    {
        $this->setupSSEHeaders();

        // Release any session locks immediately
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $token = $_COOKIE[\App\Helpers\CookieHelper::ACCESS_COOKIE] ?? $_GET['token'] ?? '';
        if (empty($token)) {
            $this->sendErrorAndExit('Authentication token required');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);
        if ($payload === null) {
            $this->sendErrorAndExit('Invalid authentication token');
        }

        // Set browser native EventSource retry interval (5000ms = 5s)
        echo "retry: 5000\n";

        // Dispatch current active orders snapshot immediately (with batch-loaded items)
        $orders = (new \App\Services\OrderService())->listActiveOrders();
        $this->sendEvent('orders_update', $orders);

        // Immediate clean exit to release the PHP worker thread
        exit;
    }

    /**
     * SSE Event Stream for user and role notifications.
     * Reconnects every 10 seconds (per Requirement 13).
     * GET /api/v2/sse/notifications?token=...
     */
    public function notifications(): void
    {
        $this->setupSSEHeaders();

        // Release any session locks immediately
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $token = $_COOKIE[\App\Helpers\CookieHelper::ACCESS_COOKIE] ?? $_GET['token'] ?? '';
        if (empty($token)) {
            $this->sendErrorAndExit('Authentication token required');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);
        if ($payload === null) {
            $this->sendErrorAndExit('Invalid authentication token');
        }

        $userId = (int) ($payload['sub'] ?? 0);
        $roleName = (string) ($payload['role'] ?? '');

        // Set browser native EventSource retry interval (10000ms = 10s)
        echo "retry: 10000\n";

        // Dispatch current unread notifications immediately
        $res = NotificationRepository::getForUser($userId, $roleName, 1, 25);
        $this->sendEvent('notifications_update', $res['data'] ?? []);

        // Immediate clean exit to release the PHP worker thread
        exit;
    }

    /**
     * SSE Event Stream for real-time user profile & permission synchronization.
     * Reconnects every 5 seconds.
     * GET /api/v2/sse/profile?token=...
     */
    public function profile(): void
    {
        $this->setupSSEHeaders();

        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $token = $_COOKIE[\App\Helpers\CookieHelper::ACCESS_COOKIE] ?? $_GET['token'] ?? '';
        if (empty($token)) {
            $this->sendErrorAndExit('Authentication token required');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);
        if ($payload === null) {
            $this->sendErrorAndExit('Invalid authentication token');
        }

        $userId = (int) ($payload['sub'] ?? 0);
        $user = \App\Repositories\UserRepository::findWithPermissions($userId);
        if ($user === null) {
            $this->sendErrorAndExit('User not found');
        }

        // Set browser native EventSource retry interval (5000ms = 5s)
        echo "retry: 5000\n";

        $profileData = (new \App\Services\AuthService())->getProfile(['id' => $userId]);
        $this->sendEvent('profile_update', $profileData['data']['profile'] ?? []);

        exit;
    }

    // ============================================
    // SSE UTILITIES
    // ============================================

    private function setupSSEHeaders(): void
    {
        // Clean any existing buffer
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache, no-transform, no-store');
        header('Connection: close');
        header('X-Accel-Buffering: no');

        ob_implicit_flush(true);
    }

    private function sendEvent(string $event, array $data): void
    {
        echo "event: {$event}\n";
        echo "data: " . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }

    private function sendErrorAndExit(string $message): void
    {
        echo "event: error\n";
        echo "data: " . json_encode(['message' => $message], JSON_UNESCAPED_UNICODE) . "\n\n";
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
        exit;
    }
}
