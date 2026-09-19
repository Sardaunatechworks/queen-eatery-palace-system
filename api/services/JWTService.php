<?php
/**
 * Queen Eatery Palace - JWT Service
 * 
 * Handles JWT token creation, verification, and refresh.
 * Uses HMAC-SHA256 (HS256) algorithm.
 * No external library dependency - pure PHP implementation.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;

class JWTService
{
    private string $secret;
    private int $accessTTL;
    private int $refreshTTL;
    private string $algorithm;
    private string $issuer;

    public function __construct()
    {
        $config = $this->loadConfig();
        $this->secret     = $config['secret'];
        $this->accessTTL  = $config['access_ttl'];
        $this->refreshTTL = $config['refresh_ttl'];
        $this->algorithm  = $config['algorithm'];
        $this->issuer     = $config['issuer'];
    }

    /**
     * Generate an access token for a user.
     */
    public function generateAccessToken(array $user): string
    {
        $now = time();
        $payload = [
            'iss'  => $this->issuer,
            'iat'  => $now,
            'exp'  => $now + $this->accessTTL,
            'sub'  => $user['id'],
            'role' => $user['role_name'] ?? '',
            'name' => $user['full_name'] ?? '',
        ];

        return $this->encode($payload);
    }

    /**
     * Generate a refresh token and store its hash in the database.
     */
    public function generateRefreshToken(int $userId): string
    {
        // Generate a cryptographically secure random token
        $token = bin2hex(random_bytes(64));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + $this->refreshTTL);

        $db = Database::getConnection();

        // Clean up expired tokens for this user
        $stmt = $db->prepare('DELETE FROM refresh_tokens WHERE user_id = :uid AND expires_at < NOW()');
        $stmt->execute(['uid' => $userId]);

        // Store new refresh token hash
        $stmt = $db->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (:uid, :hash, :exp)'
        );
        $stmt->execute([
            'uid'  => $userId,
            'hash' => $tokenHash,
            'exp'  => $expiresAt,
        ]);

        return $token;
    }

    /**
     * Verify and decode an access token.
     * Returns the payload on success, null on failure.
     */
    public function verifyAccessToken(string $token): ?array
    {
        $payload = $this->decode($token);

        if ($payload === null) {
            return null;
        }

        // Check expiration
        if (!isset($payload['exp']) || $payload['exp'] < time()) {
            return null;
        }

        // Check issuer
        if (!isset($payload['iss']) || $payload['iss'] !== $this->issuer) {
            return null;
        }

        return $payload;
    }

    /**
     * Verify a refresh token against the database.
     * Returns user_id on success, null on failure.
     */
    public function verifyRefreshToken(string $token): ?int
    {
        $tokenHash = hash('sha256', $token);
        $db = Database::getConnection();

        $stmt = $db->prepare(
            'SELECT user_id FROM refresh_tokens WHERE token_hash = :hash AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute(['hash' => $tokenHash]);
        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        return (int) $row['user_id'];
    }

    /**
     * Revoke a specific refresh token.
     */
    public function revokeRefreshToken(string $token): void
    {
        $tokenHash = hash('sha256', $token);
        $db = Database::getConnection();

        $stmt = $db->prepare('DELETE FROM refresh_tokens WHERE token_hash = :hash');
        $stmt->execute(['hash' => $tokenHash]);
    }

    /**
     * Revoke all refresh tokens for a user (e.g., on password change).
     */
    public function revokeAllTokensForUser(int $userId): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('DELETE FROM refresh_tokens WHERE user_id = :uid');
        $stmt->execute(['uid' => $userId]);
    }

    /**
     * Get the access token TTL in seconds.
     */
    public function getAccessTTL(): int
    {
        return $this->accessTTL;
    }

    // ============================================
    // JWT Encoding / Decoding (HS256)
    // ============================================

    /**
     * Encode a payload into a JWT string.
     */
    private function encode(array $payload): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];

        $segments = [];
        $segments[] = $this->base64UrlEncode(json_encode($header));
        $segments[] = $this->base64UrlEncode(json_encode($payload));

        $signingInput = implode('.', $segments);
        $signature = hash_hmac('sha256', $signingInput, $this->secret, true);
        $segments[] = $this->base64UrlEncode($signature);

        return implode('.', $segments);
    }

    /**
     * Decode and verify a JWT string.
     */
    private function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        // Verify signature
        $signingInput = "{$headerB64}.{$payloadB64}";
        $expectedSignature = hash_hmac('sha256', $signingInput, $this->secret, true);
        $actualSignature = $this->base64UrlDecode($signatureB64);

        if (!hash_equals($expectedSignature, $actualSignature)) {
            return null;
        }

        // Decode payload
        $payloadJson = $this->base64UrlDecode($payloadB64);
        $payload = json_decode($payloadJson, true);

        if (!is_array($payload)) {
            return null;
        }

        return $payload;
    }

    /**
     * Base64 URL-safe encoding.
     */
    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64 URL-safe decoding.
     */
    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }

    /**
     * Load JWT configuration.
     */
    private function loadConfig(): array
    {
        $configPath = dirname(__DIR__) . '/private/config.php';
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';

        if (file_exists($privatePath)) {
            $config = require $privatePath;
        } elseif (file_exists($configPath)) {
            $config = require $configPath;
        } else {
            throw new \RuntimeException('JWT configuration not found');
        }

        return $config['jwt'];
    }
}
