<?php
/**
 * Queen Eatery Palace - JSON Response Helper
 * 
 * Standardized JSON response format for all API endpoints.
 */

declare(strict_types=1);

namespace App\Helpers;

class Response
{
    /**
     * Send a success response.
     */
    public static function success(mixed $data = null, string $message = 'Success', int $code = 200): void
    {
        self::send($code, [
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ]);
    }

    /**
     * Send a created response (201).
     */
    public static function created(mixed $data = null, string $message = 'Created successfully'): void
    {
        self::success($data, $message, 201);
    }

    /**
     * Send an error response.
     */
    public static function error(string $message = 'An error occurred', int $code = 400, mixed $errors = null): void
    {
        $response = [
            'success' => false,
            'message' => $message,
        ];

        if ($errors !== null) {
            $response['errors'] = $errors;
        }

        self::send($code, $response);
    }

    /**
     * Send a 401 Unauthorized response.
     */
    public static function unauthorized(string $message = 'Unauthorized'): void
    {
        self::error($message, 401);
    }

    /**
     * Send a 403 Forbidden response.
     */
    public static function forbidden(string $message = 'Forbidden'): void
    {
        self::error($message, 403);
    }

    /**
     * Send a 404 Not Found response.
     */
    public static function notFound(string $message = 'Resource not found'): void
    {
        self::error($message, 404);
    }

    /**
     * Send a 429 Too Many Requests response.
     */
    public static function tooManyRequests(string $message = 'Too many requests. Please try again later.'): void
    {
        self::error($message, 429);
    }

    /**
     * Send a 500 Internal Server Error response.
     */
    public static function serverError(string $message = 'Internal server error'): void
    {
        self::error($message, 500);
    }

    /**
     * Send a paginated response.
     */
    public static function paginated(array $data, int $total, int $page, int $perPage): void
    {
        self::send(200, [
            'success' => true,
            'data'    => $data,
            'pagination' => [
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $perPage,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ]);
    }

    /**
     * Send the actual JSON response.
     */
    private static function send(int $code, array $body): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
