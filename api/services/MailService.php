<?php
/**
 * Queen Eatery Palace - SMTP Mail Service
 * 
 * Sends emails using SMTP. Built as a swappable module so the
 * SMTP provider can be changed without touching auth logic.
 * 
 * Uses PHP's built-in socket functions (no Composer dependency needed).
 */

declare(strict_types=1);

namespace App\Services;

class MailService
{
    private string $host;
    private int $port;
    private string $username;
    private string $password;
    private string $encryption;
    private string $fromEmail;
    private string $fromName;

    public function __construct()
    {
        $config = $this->loadConfig();
        $this->host       = $config['host'];
        $this->port       = $config['port'];
        $this->username   = $config['username'];
        $this->password   = $config['password'];
        $this->encryption = $config['encryption'];
        $this->fromEmail  = $config['from_email'];
        $this->fromName   = $config['from_name'];
    }

    /**
     * Send an email via SMTP.
     */
    public function send(string $to, string $subject, string $htmlBody, string $textBody = ''): bool
    {
        try {
            // Build MIME message
            $boundary = md5(uniqid(strval(time())));
            $headers = $this->buildHeaders($to, $subject, $boundary);
            $body = $this->buildBody($htmlBody, $textBody, $boundary);

            return $this->sendViaSMTP($to, $headers, $body);
        } catch (\Throwable $e) {
            error_log("MailService Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Send a password reset email.
     */
    public function sendPasswordReset(string $to, string $userName, string $resetToken): bool
    {
        $config = $this->loadAppConfig();
        $resetUrl = $config['url'] . "/reset-password?token={$resetToken}&email=" . urlencode($to);

        $subject = "Password Reset - Queen's Palace Eatery";

        $html = <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 40px 20px;">
            <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background: #c81e1e; padding: 32px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 1px;">QUEEN'S PALACE EATERY</h1>
                    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">& Event Hall</p>
                </div>
                <div style="padding: 40px 32px;">
                    <h2 style="color: #1a1a2e; margin: 0 0 16px; font-size: 22px;">Password Reset Request</h2>
                    <p style="color: #666; line-height: 1.6; margin: 0 0 24px;">Hello <strong>{$userName}</strong>,</p>
                    <p style="color: #666; line-height: 1.6; margin: 0 0 24px;">We received a request to reset your password. Click the button below to create a new password:</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="{$resetUrl}" style="display: inline-block; background: #c81e1e; color: white; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">Reset Password</a>
                    </div>
                    <p style="color: #999; font-size: 12px; line-height: 1.6;">This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                    <p style="color: #ccc; font-size: 10px; text-align: center;">If the button doesn't work, copy and paste this URL:<br>{$resetUrl}</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px 32px; text-align: center;">
                    <p style="color: #999; font-size: 10px; margin: 0;">Queen's Palace Eatery & Event Hall, Dutse, Jigawa State</p>
                </div>
            </div>
        </body>
        </html>
        HTML;

        $text = "Hello {$userName},\n\nWe received a request to reset your password.\n\nReset your password here: {$resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\n- Queen's Palace Eatery & Event Hall";

        return $this->send($to, $subject, $html, $text);
    }

    /**
     * Send a welcome email after registration.
     */
    public function sendWelcome(string $to, string $userName): bool
    {
        $subject = "Welcome to Queen's Palace Eatery!";

        $html = <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 40px 20px;">
            <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background: #c81e1e; padding: 32px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 900;">QUEEN'S PALACE EATERY</h1>
                    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 3px;">& Event Hall</p>
                </div>
                <div style="padding: 40px 32px;">
                    <h2 style="color: #1a1a2e; margin: 0 0 16px; font-size: 22px;">Welcome, {$userName}! 👑</h2>
                    <p style="color: #666; line-height: 1.6;">Your account has been created successfully. You can now:</p>
                    <ul style="color: #666; line-height: 2;">
                        <li>Browse our delicious menu</li>
                        <li>Place orders online</li>
                        <li>Track your order status</li>
                        <li>Choose pickup or delivery</li>
                    </ul>
                    <p style="color: #666; line-height: 1.6;">Thank you for choosing Queen's Palace Eatery!</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px 32px; text-align: center;">
                    <p style="color: #999; font-size: 10px; margin: 0;">Queen's Palace Eatery & Event Hall, Dutse, Jigawa State</p>
                </div>
            </div>
        </body>
        </html>
        HTML;

        return $this->send($to, $subject, $html);
    }

    // ============================================
    // SMTP Implementation
    // ============================================

    /**
     * Send email via SMTP socket connection.
     */
    private function sendViaSMTP(string $to, string $headers, string $body): bool
    {
        $protocol = $this->encryption === 'ssl' ? 'ssl://' : '';
        $socket = @fsockopen($protocol . $this->host, $this->port, $errno, $errstr, 30);

        if (!$socket) {
            error_log("SMTP Connection Failed: {$errstr} ({$errno})");
            return false;
        }

        try {
            $this->readResponse($socket);
            $this->sendCommand($socket, "EHLO " . gethostname());

            // STARTTLS for TLS encryption
            if ($this->encryption === 'tls') {
                $this->sendCommand($socket, "STARTTLS");
                stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                $this->sendCommand($socket, "EHLO " . gethostname());
            }

            // Authenticate
            $this->sendCommand($socket, "AUTH LOGIN");
            $this->sendCommand($socket, base64_encode($this->username));
            $this->sendCommand($socket, base64_encode($this->password));

            // Send email
            $this->sendCommand($socket, "MAIL FROM:<{$this->fromEmail}>");
            $this->sendCommand($socket, "RCPT TO:<{$to}>");
            $this->sendCommand($socket, "DATA");

            fwrite($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
            $this->readResponse($socket);

            $this->sendCommand($socket, "QUIT");

            return true;
        } catch (\Throwable $e) {
            error_log("SMTP Error: " . $e->getMessage());
            return false;
        } finally {
            fclose($socket);
        }
    }

    private function sendCommand($socket, string $command): string
    {
        fwrite($socket, $command . "\r\n");
        return $this->readResponse($socket);
    }

    private function readResponse($socket): string
    {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if ($line[3] === ' ') break;
        }
        return $response;
    }

    private function buildHeaders(string $to, string $subject, string $boundary): string
    {
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "From: {$this->fromName} <{$this->fromEmail}>\r\n";
        $headers .= "To: {$to}\r\n";
        $headers .= "Subject: {$subject}\r\n";
        $headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
        $headers .= "X-Mailer: QEP-MailService/2.0\r\n";
        return $headers;
    }

    private function buildBody(string $html, string $text, string $boundary): string
    {
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $body .= ($text ?: strip_tags($html)) . "\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $body .= $html . "\r\n";
        $body .= "--{$boundary}--\r\n";
        return $body;
    }

    private function loadConfig(): array
    {
        $configPath = dirname(__DIR__) . '/private/config.php';
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';
        if (file_exists($privatePath)) { $c = require $privatePath; }
        elseif (file_exists($configPath)) { $c = require $configPath; }
        else { throw new \RuntimeException('Mail config not found'); }
        return $c['mail'];
    }

    private function loadAppConfig(): array
    {
        $configPath = dirname(__DIR__) . '/private/config.php';
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';
        if (file_exists($privatePath)) { $c = require $privatePath; }
        elseif (file_exists($configPath)) { $c = require $configPath; }
        else { throw new \RuntimeException('App config not found'); }
        return $c['app'];
    }
}
