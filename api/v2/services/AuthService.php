<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Auth Service
 *
 * Business logic for authentication: login, signup, token refresh, password reset.
 */

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Repositories\UserRepository;
use App\Helpers\Sanitizer;

class AuthService
{
    private JWTService $jwt;

    public function __construct()
    {
        $this->jwt = new JWTService();
    }

    /**
     * Authenticate a user with email and password.
     */
    public function login(string $email, string $password): array
    {
        $user = UserRepository::findByEmail(Sanitizer::email($email));

        if (!$user) {
            return ['success' => false, 'message' => 'Invalid email or password'];
        }

        if (!password_verify($password, $user['password_hash'])) {
            return ['success' => false, 'message' => 'Invalid email or password'];
        }

        if ($user['status'] !== STATUS_ACTIVE) {
            return ['success' => false, 'message' => 'Your account is ' . $user['status'] . '. Contact an administrator.'];
        }

        // Update last login
        UserRepository::updateLastLogin((int) $user['id']);

        // Generate tokens
        $accessToken = $this->jwt->generateAccessToken($user);
        $refreshToken = $this->jwt->generateRefreshToken((int) $user['id']);

        return [
            'success' => true,
            'data' => [
                'accessToken'  => $accessToken,
                'refreshToken' => $refreshToken,
                'expiresIn'    => $this->jwt->getAccessTTL(),
                'profile'      => $this->buildProfile($user),
            ],
        ];
    }

    /**
     * Register a new customer account.
     */
    public function signup(array $data): array
    {
        $email = Sanitizer::email($data['email']);

        if (UserRepository::emailExists($email)) {
            return ['success' => false, 'message' => 'An account with this email already exists'];
        }

        $roleId = UserRepository::getRoleId(ROLE_CUSTOMER);
        if (!$roleId) {
            return ['success' => false, 'message' => 'System configuration error: customer role not found'];
        }

        $userId = UserRepository::create([
            'full_name'     => Sanitizer::clean($data['full_name']),
            'email'         => $email,
            'phone'         => isset($data['phone']) ? Sanitizer::phone($data['phone']) : null,
            'address'       => isset($data['address']) ? Sanitizer::clean($data['address']) : null,
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]),
            'role_id'       => $roleId,
            'status'        => STATUS_ACTIVE,
        ]);

        $user = UserRepository::findById($userId);

        // Generate tokens
        $accessToken = $this->jwt->generateAccessToken($user);
        $refreshToken = $this->jwt->generateRefreshToken($userId);

        return [
            'success' => true,
            'data' => [
                'accessToken'  => $accessToken,
                'refreshToken' => $refreshToken,
                'expiresIn'    => $this->jwt->getAccessTTL(),
                'profile'      => $this->buildProfile($user),
            ],
        ];
    }

    /**
     * Refresh an access token using a refresh token.
     */
    public function refresh(string $refreshToken): array
    {
        $userId = $this->jwt->verifyRefreshToken($refreshToken);

        if ($userId === null) {
            return ['success' => false, 'message' => 'Invalid or expired refresh token'];
        }

        $user = UserRepository::findById($userId);

        if (!$user || $user['status'] !== STATUS_ACTIVE) {
            return ['success' => false, 'message' => 'Account is no longer active'];
        }

        $accessToken = $this->jwt->generateAccessToken($user);

        return [
            'success' => true,
            'data' => [
                'accessToken' => $accessToken,
                'expiresIn'   => $this->jwt->getAccessTTL(),
                'profile'     => $this->buildProfile($user),
            ],
        ];
    }

    /**
     * Revoke a refresh token (logout).
     */
    public function logout(string $refreshToken): void
    {
        $this->jwt->revokeRefreshToken($refreshToken);
    }

    /**
     * Initiate password reset — generate token and store hash.
     */
    public function initiatePasswordReset(string $email): array
    {
        $email = Sanitizer::email($email);
        $user = UserRepository::findByEmail($email);

        // Always return success to prevent email enumeration
        if (!$user) {
            return ['success' => true, 'message' => 'If an account exists, a reset link has been sent.'];
        }

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + 3600); // 1 hour

        $db = Database::getConnection();

        // Invalidate existing reset tokens for this email
        $stmt = $db->prepare('UPDATE password_resets SET used = 1 WHERE email = :email AND used = 0');
        $stmt->execute(['email' => $email]);

        // Insert new reset token
        $stmt = $db->prepare('INSERT INTO password_resets (email, token_hash, expires_at) VALUES (:email, :hash, :exp)');
        $stmt->execute([
            'email' => $email,
            'hash'  => $tokenHash,
            'exp'   => $expiresAt,
        ]);

        // Return token for the mail service to use
        return [
            'success' => true,
            'message' => 'If an account exists, a reset link has been sent.',
            '_token'  => $token, // Internal use — for MailService
            '_email'  => $email,
            '_name'   => $user['full_name'],
        ];
    }

    /**
     * Complete password reset with token.
     */
    public function resetPassword(string $token, string $newPassword): array
    {
        $tokenHash = hash('sha256', $token);
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT email FROM password_resets
            WHERE token_hash = :hash AND used = 0 AND expires_at > NOW()
            LIMIT 1
        ');
        $stmt->execute(['hash' => $tokenHash]);
        $reset = $stmt->fetch();

        if (!$reset) {
            return ['success' => false, 'message' => 'Invalid or expired reset token'];
        }

        $user = UserRepository::findByEmail($reset['email']);
        if (!$user) {
            return ['success' => false, 'message' => 'User account not found'];
        }

        // Update password
        $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        UserRepository::updatePassword((int) $user['id'], $hash);

        // Mark token as used
        $stmt = $db->prepare('UPDATE password_resets SET used = 1 WHERE token_hash = :hash');
        $stmt->execute(['hash' => $tokenHash]);

        // Revoke all refresh tokens
        $this->jwt->revokeAllTokensForUser((int) $user['id']);

        AuditService::passwordReset((int) $user['id']);

        return ['success' => true, 'message' => 'Password reset successfully. Please log in.'];
    }

    /**
     * Get current user profile.
     */
    public function getProfile(array $authUser): array
    {
        $user = UserRepository::findWithPermissions((int) $authUser['id']);
        if (!$user) {
            return ['success' => false, 'message' => 'User not found'];
        }

        return [
            'success' => true,
            'data' => [
                'profile' => $this->buildProfile($user),
            ],
        ];
    }

    /**
     * Build a safe user profile (no password hash).
     */
    private function buildProfile(array $user): array
    {
        return [
            'uid'         => (string) $user['id'],
            'name'        => $user['full_name'],
            'email'       => $user['email'],
            'phone'       => $user['phone'] ?? '',
            'address'     => $user['address'] ?? '',
            'role'        => $user['role_name'],
            'roleDisplay' => $user['role_display_name'] ?? ucfirst($user['role_name']),
            'status'      => $user['status'],
            'photoURL'    => $user['profile_image'] ?? null,
            'permissions' => $user['permissions'] ?? [],
        ];
    }
}
