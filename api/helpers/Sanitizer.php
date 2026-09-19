<?php
/**
 * Queen Eatery Palace - Input Sanitizer
 * 
 * Sanitizes user input to prevent XSS and injection attacks.
 */

declare(strict_types=1);

namespace App\Helpers;

class Sanitizer
{
    /**
     * Sanitize a single string value (strip tags, encode entities).
     */
    public static function clean(mixed $value): mixed
    {
        if (is_string($value)) {
            // Remove null bytes
            $value = str_replace("\0", '', $value);
            // Strip HTML/PHP tags
            $value = strip_tags($value);
            // Convert special characters to HTML entities
            $value = htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            // Trim whitespace
            $value = trim($value);
            return $value;
        }

        if (is_array($value)) {
            return self::cleanArray($value);
        }

        // Return non-string values as-is (numbers, booleans, null)
        return $value;
    }

    /**
     * Recursively sanitize an array of values.
     */
    public static function cleanArray(array $data): array
    {
        $cleaned = [];
        foreach ($data as $key => $value) {
            $cleanKey = is_string($key) ? self::clean($key) : $key;
            $cleaned[$cleanKey] = self::clean($value);
        }
        return $cleaned;
    }

    /**
     * Sanitize for output (encode for display, but keep original for DB storage).
     */
    public static function output(mixed $value): string
    {
        if (!is_string($value)) {
            $value = (string) $value;
        }
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /**
     * Normalize an email address (lowercase, trim).
     */
    public static function email(string $email): string
    {
        return strtolower(trim($email));
    }

    /**
     * Clean a filename for safe storage.
     * Removes path components, special characters, and ensures safe extension.
     */
    public static function filename(string $filename): string
    {
        // Get just the filename (remove any path components)
        $filename = basename($filename);
        // Remove anything that isn't alphanumeric, dash, underscore, or dot
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        // Remove multiple consecutive dots (prevent extension tricks)
        $filename = preg_replace('/\.{2,}/', '.', $filename);
        // Trim underscores and dots from edges
        $filename = trim($filename, '_.');
        return $filename;
    }

    /**
     * Sanitize an integer value.
     */
    public static function int(mixed $value): int
    {
        return (int) filter_var($value, FILTER_SANITIZE_NUMBER_INT);
    }

    /**
     * Sanitize a float value.
     */
    public static function float(mixed $value): float
    {
        return (float) filter_var($value, FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
    }
}
