<?php
/**
 * Queen Eatery Palace - SSE Controller
 * 
 * Implements real-time Server-Sent Events for order status updates
 * and notifications, utilizing client reconnects to prevent script timeouts.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Services\JWTService;
use App\Services\OrderItemService;
use App\Helpers\Response;
use PDO;

class SSEController
{
    /**
     * SSE Event Stream for active orders (Staff terminal)
     * GET /api/sse/orders?token=...
     */
    public function orders(): void
    {
        $this->disableBufferingAndSetHeaders();

        // Extract token from query parameter (EventSource natively doesn't support headers)
        $token = $_GET['token'] ?? '';
        if (empty($token)) {
            $this->sendErrorAndExit('Authentication token required');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);
        if ($payload === null) {
            $this->sendErrorAndExit('Invalid token');
        }

        $db = Database::getConnection();

        // Release any open session immediately
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        echo "retry: 5000\n";

        // Fetch active workflow orders to broadcast
        $stmt = $db->query('
            SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.customer_id = u.id
            WHERE o.order_status IN ("received", "preparing", "ready")
            ORDER BY o.created_at ASC
        ');
        $orders = $stmt->fetchAll();

        // Batch-load order items in 1 query and format for frontend
        OrderItemService::prepareForResponse($orders);

        $this->sendEvent('orders_update', $orders);
        exit;
    }

    /**
     * SSE Event Stream for Notifications
     * Reconnects every 10 seconds (per Requirement 13)
     * GET /api/sse/notifications?token=...
     */
    public function notifications(): void
    {
        $this->disableBufferingAndSetHeaders();

        // Release session lock immediately
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $token = $_GET['token'] ?? '';
        if (empty($token)) {
            $this->sendErrorAndExit('Authentication token required');
        }

        $jwt = new JWTService();
        $payload = $jwt->verifyAccessToken($token);
        if ($payload === null) {
            $this->sendErrorAndExit('Invalid token');
        }

        $userId = (int)($payload['sub'] ?? 0);
        $roleName = $payload['role'] ?? '';

        $db = Database::getConnection();

        echo "retry: 10000\n";

        // Fetch unread notifications
        $stmt = $db->prepare('
            SELECT * FROM notifications
            WHERE (user_id = :uid OR role_target = :role OR (user_id IS NULL AND role_target IS NULL))
              AND is_read = 0
            ORDER BY created_at DESC
            LIMIT 25
        ');
        $stmt->execute([
            'uid'  => $userId,
            'role' => $roleName
        ]);
        $notifications = $stmt->fetchAll();

        foreach ($notifications as &$n) {
            $n['id'] = (string)$n['id'];
            $n['user_id'] = $n['user_id'] ? (string)$n['user_id'] : null;
            $n['is_read'] = (bool)$n['is_read'];
        }

        $this->sendEvent('notifications_update', $notifications);
        exit;
    }

    // ============================================
    // HELPERS
    // ============================================

    private function disableBufferingAndSetHeaders(): void
    {
        // Extend time limit for SSE loop
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        // Set SSE headers
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no'); // disables proxy buffering in Nginx

        // Clear output buffering
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        ob_implicit_flush(true);
    }

    private function sendEvent(string $event, array $data): void
    {
        echo "event: {$event}\n";
        echo "data: " . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
        flush();
    }

    private function sendErrorAndExit(string $message): void
    {
        echo "event: error\n";
        echo "data: " . json_encode(['message' => $message]) . "\n\n";
        flush();
        exit;
    }
}
