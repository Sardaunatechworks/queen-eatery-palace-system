<?php
/**
 * Queen Eatery Palace - Payment Controller
 * 
 * Securely handles Paystack payment verifications, matches transaction amounts,
 * updates order statuses, and inserts transaction records within database transactions.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\PaystackService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use PDO;

class PaymentController
{
    /**
     * Verify Paystack transaction payment
     * POST /api/payments/verify
     */
    public function verify(): void
    {
        AuthMiddleware::verify();
        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'reference')
                  ->required($input, 'order_id');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $reference = Sanitizer::clean($input['reference']);
        $orderId = (int)$input['order_id'];

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            // 1. Lock the order row to prevent duplicate updates (race conditions)
            $stmt = $db->prepare('SELECT id, order_number, total_amount, payment_status, status FROM orders WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $orderId]);
            $order = $stmt->fetch();

            if (!$order) {
                Response::notFound('Associated order not found');
            }

            // 2. If already paid, return early with success
            if ($order['payment_status'] === 'paid') {
                $db->commit();
                Response::success([
                    'order_id'       => (string)$orderId,
                    'payment_status' => 'paid',
                    'status'         => $order['status']
                ], 'Payment already verified');
                return;
            }

            // 3. Verify with Paystack Service
            $paystack = new PaystackService();
            $payResult = $paystack->verifyTransaction($reference);

            if (!$payResult['success']) {
                $db->rollBack();
                Response::error($payResult['message'], 400);
            }

            // 4. Verify amount match (Paystack returns amount in Naira as float)
            $expectedAmount = (float)$order['total_amount'];
            $actualAmount = (float)$payResult['amount'];

            // Allow small float precision tolerance
            if (abs($expectedAmount - $actualAmount) > 0.05) {
                // Log anomaly
                error_log("Payment amount mismatch: Order ID {$orderId} expects {$expectedAmount}, got {$actualAmount}");
                $db->rollBack();
                Response::error("Payment amount mismatch. Expected: {$expectedAmount}, Received: {$actualAmount}", 400);
            }

            // 5. Save transaction details
            $stmt = $db->prepare('
                INSERT INTO transactions (order_id, reference, amount, payment_method, status)
                VALUES (:oid, :ref, :amount, "paystack", "success")
            ');
            $stmt->execute([
                'oid'    => $orderId,
                'ref'    => $reference,
                'amount' => $actualAmount
            ]);

            // 6. Update order payment status and workflow status
            $stmt = $db->prepare('
                UPDATE orders 
                SET payment_status = "paid", status = "received" 
                WHERE id = :id
            ');
            $stmt->execute(['id' => $orderId]);

            $db->commit();

            // Log Audit
            AuditService::paymentVerified($orderId, $reference, $actualAmount);

            // Send notification to cashier & kitchen
            $this->createNotification(
                null,
                ROLE_CASHIER,
                "Order Paid Successfully",
                "Order {$order['order_number']} has been paid via Paystack. Amount: ₦" . number_format($actualAmount, 2),
                NOTIFY_ORDER
            );

            Response::success([
                'order_id'       => (string)$orderId,
                'payment_status' => 'paid',
                'status'         => 'received'
            ], 'Payment verified and order updated successfully');

        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * List all transactions (Admin/Cashier)
     * GET /api/payments/transactions
     */
    public function transactions(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN, ROLE_CASHIER);

        $db = Database::getConnection();
        $stmt = $db->query('
            SELECT t.*, o.order_number, u.full_name AS customer_name
            FROM transactions t
            JOIN orders o ON t.order_id = o.id
            JOIN users u ON o.user_id = u.id
            ORDER BY t.created_at DESC
        ');
        $txs = $stmt->fetchAll();

        foreach ($txs as &$tx) {
            $tx['id'] = (string)$tx['id'];
            $tx['order_id'] = (string)$tx['order_id'];
            $tx['amount'] = (float)$tx['amount'];
        }

        Response::success($txs);
    }

    // Helper notification
    private function createNotification(?int $userId, ?string $roleTarget, string $title, string $message, string $type): void
    {
        try {
            $db = Database::getConnection();
            $stmt = $db->prepare('
                INSERT INTO notifications (user_id, role_target, title, message, type, is_read)
                VALUES (:uid, :role, :title, :message, :type, 0)
            ');
            $stmt->execute([
                'uid'     => $userId,
                'role'    => $roleTarget,
                'title'   => $title,
                'message' => $message,
                'type'    => $type
            ]);
        } catch (\Throwable $e) {
            error_log("Failed to create notification in PaymentController: " . $e->getMessage());
        }
    }
}
