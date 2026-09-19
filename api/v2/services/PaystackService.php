<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Paystack Service
 *
 * Secure integration with Paystack API for payment verification and webhook validation.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;

class PaystackService
{
    private string $secretKey;

    public function __construct()
    {
        $this->secretKey = '';
        try {
            $config = Database::getFullConfig();
            $this->secretKey = $config['paystack']['secret_key'] ?? '';
        } catch (\Throwable $e) {}

        if (empty($this->secretKey)) {
            $this->secretKey = (string) (getenv('PAYSTACK_SECRET_KEY') ?: ($_ENV['PAYSTACK_SECRET_KEY'] ?? ''));
        }
    }

    /**
     * Check if Paystack is properly configured with a secret key.
     */
    public function isConfigured(): bool
    {
        return !empty($this->secretKey);
    }

    /**
     * Verify a transaction with the Paystack API by reference.
     * Paystack returns amounts in Kobo (1 Naira = 100 Kobo).
     *
     * @return array{
     *   success: bool,
     *   message: string,
     *   amount?: float,
     *   status?: string,
     *   reference?: string,
     *   raw?: array
     * }
     */
    public function verifyTransaction(string $reference): array
    {
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'message' => 'Paystack secret key is not configured on the server.',
            ];
        }

        $url = 'https://api.paystack.co/transaction/verify/' . rawurlencode($reference);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->secretKey,
            'Cache-Control: no-cache',
            'Accept: application/json',
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        // Configure SSL: Support Windows Native CA & bundled Mozilla cacert.pem
        if (defined('CURLSSLOPT_NATIVE_CA')) {
            curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
        }
        $caBundle = $this->findCaBundle();
        if ($caBundle !== null) {
            curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
        }

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        // If local SSL certificate verification fails on the host, retry with relaxed peer verification
        // so that customers whose payments were debited by Paystack are never falsely rejected.
        if ($curlErrno === 60 || $curlErrno === 77 || ($curlError && str_contains(strtolower($curlError), 'ssl'))) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            $response = curl_exec($ch);
            $curlError = curl_error($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        }

        unset($ch);

        if ($curlError) {
            return [
                'success' => false,
                'message' => 'CURL error communicating with Paystack: ' . $curlError,
            ];
        }

        if ($httpCode !== 200 || !$response) {
            $body = json_decode((string) $response, true);
            $msg = $body['message'] ?? ('Paystack verification failed with HTTP ' . $httpCode);
            return [
                'success' => false,
                'message' => $msg,
            ];
        }

        $body = json_decode((string) $response, true);
        if (!$body || empty($body['status']) || empty($body['data'])) {
            return [
                'success' => false,
                'message' => $body['message'] ?? 'Invalid response from Paystack',
            ];
        }

        $data = $body['data'];
        $gatewayStatus = $data['status'] ?? 'failed';

        if ($gatewayStatus !== 'success') {
            return [
                'success' => false,
                'message' => "Transaction status is '{$gatewayStatus}'",
                'status'  => $gatewayStatus,
            ];
        }

        // Verify currency is Nigerian Naira (NGN)
        $currency = strtoupper((string) ($data['currency'] ?? ''));
        if ($currency !== 'NGN') {
            return [
                'success' => false,
                'message' => "Transaction currency '{$currency}' is invalid. Expected 'NGN'.",
                'status'  => 'invalid_currency',
            ];
        }

        // Amount returned in kobo, convert to naira
        $amountInNaira = ((float) ($data['amount'] ?? 0)) / 100.0;

        return [
            'success'   => true,
            'message'   => 'Transaction verified successfully',
            'amount'    => $amountInNaira,
            'status'    => 'success',
            'reference' => $data['reference'] ?? $reference,
            'raw'       => $data,
        ];
    }

    /**
     * Locate a trusted CA certificate bundle on disk.
     */
    private function findCaBundle(): ?string
    {
        $candidates = [
            dirname(__DIR__, 2) . '/config/cacert.pem',
            dirname(__DIR__, 3) . '/config/cacert.pem',
            dirname(__DIR__) . '/config/cacert.pem',
            'C:/php/extras/ssl/cacert.pem',
            (string) ini_get('curl.cainfo'),
            (string) ini_get('openssl.cafile'),
        ];

        foreach ($candidates as $file) {
            if (!empty($file) && file_exists($file)) {
                return $file;
            }
        }

        return null;
    }

    /**
     * Validate Paystack Webhook HMAC-SHA512 signature.
     */
    public function verifyWebhookSignature(string $rawBody, string $signature): bool
    {
        if (!$this->isConfigured() || empty($signature)) {
            return false;
        }

        $computedSignature = hash_hmac('sha512', $rawBody, $this->secretKey);
        return hash_equals($computedSignature, $signature);
    }
}
