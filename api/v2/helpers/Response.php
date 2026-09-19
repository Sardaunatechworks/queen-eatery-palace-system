<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 JSON Response Helper
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
     * 400 Bad Request.
     */
    public static function badRequest(string $message = 'Bad request', mixed $errors = null): void
    {
        self::error($message, 400, $errors);
    }

    /**
     * 422 Unprocessable Entity / Validation Error.
     */
    public static function validationError(mixed $errors = null, string $message = 'Validation failed'): void
    {
        self::error($message, 422, $errors);
    }

    /**
     * 401 Unauthorized.
     */
    public static function unauthorized(string $message = 'Unauthorized'): void
    {
        self::error($message, 401);
    }

    /**
     * 403 Forbidden.
     */
    public static function forbidden(string $message = 'Forbidden'): void
    {
        self::error($message, 403);
    }

    /**
     * 404 Not Found.
     */
    public static function notFound(string $message = 'Resource not found'): void
    {
        self::error($message, 404);
    }

    /**
     * 429 Too Many Requests.
     */
    public static function tooManyRequests(string $message = 'Too many requests. Please try again later.'): void
    {
        self::error($message, 429);
    }

    /**
     * 500 Internal Server Error.
     */
    public static function serverError(string $message = 'Internal server error'): void
    {
        self::error($message, 500);
    }

    /**
     * Paginated response.
     */
    public static function paginated(array $data, int $total, int $page, int $perPage): void
    {
        self::send(200, [
            'success'    => true,
            'data'       => $data,
            'pagination' => [
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $perPage,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ]);
    }

    /**
     * Send the actual JSON response and exit.
     */
    private static function send(int $code, array $body): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');

        if (defined('QEP_START_TIME')) {
            $duration = round((microtime(true) - QEP_START_TIME) * 1000, 2);
            header("X-Response-Time-Ms: {$duration}");
            header("X-Memory-Peak-Kb: " . round(memory_get_peak_usage() / 1024, 2));
        }

        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
