<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 JWT Service
 *
 * Pure PHP HMAC-SHA256 JWT implementation. No external library.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;

class JWTService
{
    private string $secret;
    private int $accessTTL;
    private int $refreshTTL;
    private string $issuer;

    public function __construct()
    {
        $config = $this->loadConfig();
        $this->secret     = $config['secret'];
        $this->accessTTL  = $config['access_ttl'];
        $this->refreshTTL = $config['refresh_ttl'];
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
     */
    public function verifyAccessToken(string $token): ?array
    {
        $payload = $this->decode($token);

        if ($payload === null) {
            return null;
        }

        if (!isset($payload['exp']) || $payload['exp'] < time()) {
            return null;
        }

        if (!isset($payload['iss']) || $payload['iss'] !== $this->issuer) {
            return null;
        }

        return $payload;
    }

    /**
     * Verify a refresh token against the database.
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
     * Revoke all refresh tokens for a user.
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

    private function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $signingInput = "{$headerB64}.{$payloadB64}";
        $expectedSignature = hash_hmac('sha256', $signingInput, $this->secret, true);
        $actualSignature = $this->base64UrlDecode($signatureB64);

        if (!hash_equals($expectedSignature, $actualSignature)) {
            return null;
        }

        $payloadJson = $this->base64UrlDecode($payloadB64);
        $payload = json_decode($payloadJson, true);

        if (!is_array($payload)) {
            return null;
        }

        return $payload;
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }

    private function loadConfig(): array
    {
        return Database::getFullConfig()['jwt'];
    }
}
