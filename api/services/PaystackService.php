<?php
/**
 * Queen Eatery Palace - Paystack Service
 * 
 * Interacts with Paystack API to verify payment transactions securely.
 */

declare(strict_types=1);

namespace App\Services;

class PaystackService
{
    private string $secretKey;

    public function __construct()
    {
        // Search config path in standard locations
        $configPath = dirname(__DIR__) . '/private/config.php';
        if (!file_exists($configPath)) {
            $configPath = __DIR__ . '/../private/config.php';
        }
        
        $config = file_exists($configPath) ? require $configPath : [];
        $this->secretKey = $config['paystack']['secret_key'] ?? '';
    }

    /**
     * Verify Paystack transaction by reference code
     */
    public function verifyTransaction(string $reference): array
    {
        if (empty($this->secretKey)) {
            return [
                'success' => false,
                'message' => 'Paystack secret key is not configured.'
            ];
        }

        $url = "https://api.paystack.co/transaction/verify/" . rawurlencode($reference);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer " . $this->secretKey,
            "Cache-Control: no-cache"
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        if (defined('CURLSSLOPT_NATIVE_CA')) {
            curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
        }
        $caBundle = $this->findCaBundle();
        if ($caBundle !== null) {
            curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
        }
        
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $errNo = curl_errno($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($errNo === 60 || $errNo === 77 || ($err && str_contains(strtolower($err), 'ssl'))) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            $response = curl_exec($ch);
            $err = curl_error($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        }

        unset($ch);

        if ($err) {
            return [
                'success' => false,
                'message' => 'CURL Error: ' . $err
            ];
        }

        if ($httpCode !== 200) {
            $errBody = json_decode((string)$response, true);
            $msg = $errBody['message'] ?? "Paystack returned HTTP status code {$httpCode}";
            return [
                'success' => false,
                'message' => $msg
            ];
        }

        $data = json_decode($response, true);

        if (
            isset($data['status']) && $data['status'] === true &&
            isset($data['data']['status']) && $data['data']['status'] === 'success'
        ) {
            return [
                'success'          => true,
                'amount'           => (float)($data['data']['amount'] / 100), // convert kobo to Naira
                'reference'        => $data['data']['reference'],
                'channel'          => $data['data']['channel'] ?? '',
                'gateway_response' => $data['data']['gateway_response'] ?? '',
                'metadata'         => $data['data']['metadata'] ?? []
            ];
        }

        return [
            'success' => false,
            'message' => $data['message'] ?? 'Transaction is not successful'
        ];
    }

    /**
     * Locate a trusted CA certificate bundle on disk.
     */
    private function findCaBundle(): ?string
    {
        $candidates = [
            dirname(__DIR__) . '/config/cacert.pem',
            dirname(__DIR__, 2) . '/config/cacert.pem',
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
}
