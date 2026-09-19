<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Input Sanitizer
 */

declare(strict_types=1);

namespace App\Helpers;

class Sanitizer
{
    /**
     * Clean a value: trim and strip tags for strings, recursively cleans arrays.
     */
    public static function clean(mixed $value): mixed
    {
        if ($value === null || $value === false) {
            return '';
        }
        if (is_array($value)) {
            return self::cleanArray($value);
        }
        if (is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }
        return trim(strip_tags((string) $value));
    }

    /**
     * Alias for clean() to support string sanitization.
     */
    public static function string(mixed $value): string
    {
        return self::clean($value);
    }

    /**
     * Clean an email address.
     */
    public static function email(string $value): string
    {
        return strtolower(trim(filter_var($value, FILTER_SANITIZE_EMAIL) ?: ''));
    }

    /**
     * Clean a phone number — digits, +, -, spaces only.
     */
    public static function phone(string $value): string
    {
        return preg_replace('/[^\d+\-\s()]/', '', trim($value)) ?? '';
    }

    /**
     * Clean an integer value.
     */
    public static function int(mixed $value): int
    {
        return (int) filter_var($value, FILTER_SANITIZE_NUMBER_INT);
    }

    /**
     * Clean a float value.
     */
    public static function float(mixed $value): float
    {
        return (float) filter_var($value, FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
    }

    /**
     * Sanitize an array of values.
     * If $fields is provided, cleans only specified fields; otherwise recursively cleans all values.
     */
    public static function cleanArray(array $data, ?array $fields = null): array
    {
        $cleaned = [];
        if ($fields !== null) {
            foreach ($fields as $field) {
                if (isset($data[$field])) {
                    $cleaned[$field] = self::clean($data[$field]);
                }
            }
            return $cleaned;
        }

        foreach ($data as $key => $value) {
            $cleanKey = is_string($key) ? trim(strip_tags($key)) : $key;
            $cleaned[$cleanKey] = is_array($value) ? self::cleanArray($value) : self::clean($value);
        }
        return $cleaned;
    }
}
