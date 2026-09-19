<?php
/**
 * Queen Eatery Palace - Input Validator
 * 
 * Server-side validation for all incoming data.
 */

declare(strict_types=1);

namespace App\Helpers;

class Validator
{
    private array $errors = [];

    /**
     * Validate a required field exists and is non-empty.
     */
    public function required(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
            $this->errors[$field] = "{$label} is required";
        }
        return $this;
    }

    /**
     * Validate email format.
     */
    public function email(array $data, string $field, string $label = 'Email'): self
    {
        if (isset($data[$field]) && !filter_var($data[$field], FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = "{$label} is not a valid email address";
        }
        return $this;
    }

    /**
     * Validate minimum string length.
     */
    public function minLength(array $data, string $field, int $min, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && is_string($data[$field]) && mb_strlen(trim($data[$field])) < $min) {
            $this->errors[$field] = "{$label} must be at least {$min} characters";
        }
        return $this;
    }

    /**
     * Validate maximum string length.
     */
    public function maxLength(array $data, string $field, int $max, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && is_string($data[$field]) && mb_strlen(trim($data[$field])) > $max) {
            $this->errors[$field] = "{$label} must not exceed {$max} characters";
        }
        return $this;
    }

    /**
     * Validate that a value is in a whitelist of allowed values.
     */
    public function inArray(array $data, string $field, array $allowed, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && !in_array($data[$field], $allowed, true)) {
            $this->errors[$field] = "{$label} must be one of: " . implode(', ', $allowed);
        }
        return $this;
    }

    /**
     * Validate a numeric field.
     */
    public function numeric(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && !is_numeric($data[$field])) {
            $this->errors[$field] = "{$label} must be a number";
        }
        return $this;
    }

    /**
     * Validate a positive number (greater than 0).
     */
    public function positiveNumber(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && (!is_numeric($data[$field]) || (float)$data[$field] <= 0)) {
            $this->errors[$field] = "{$label} must be a positive number";
        }
        return $this;
    }

    /**
     * Validate an integer field.
     */
    public function integer(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && filter_var($data[$field], FILTER_VALIDATE_INT) === false) {
            $this->errors[$field] = "{$label} must be an integer";
        }
        return $this;
    }

    /**
     * Validate a non-negative integer (0 or greater).
     */
    public function nonNegativeInt(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field])) {
            $val = filter_var($data[$field], FILTER_VALIDATE_INT);
            if ($val === false || $val < 0) {
                $this->errors[$field] = "{$label} must be 0 or greater";
            }
        }
        return $this;
    }

    /**
     * Validate that a value is a string.
     */
    public function string(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && !is_string($data[$field])) {
            $this->errors[$field] = "{$label} must be a string";
        }
        return $this;
    }

    /**
     * Validate that a value is an array.
     */
    public function isArray(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && !is_array($data[$field])) {
            $this->errors[$field] = "{$label} must be an array";
        }
        return $this;
    }

    /**
     * Validate that an array is not empty.
     */
    public function notEmptyArray(array $data, string $field, string $label = ''): self
    {
        $label = $label ?: $field;
        if (isset($data[$field]) && is_array($data[$field]) && empty($data[$field])) {
            $this->errors[$field] = "{$label} must not be empty";
        }
        return $this;
    }

    /**
     * Validate phone number format (basic - allows + and digits).
     */
    public function phone(array $data, string $field, string $label = 'Phone'): self
    {
        if (isset($data[$field]) && !empty($data[$field])) {
            $cleaned = preg_replace('/[\s\-()]/', '', $data[$field]);
            if (!preg_match('/^\+?[0-9]{7,15}$/', $cleaned)) {
                $this->errors[$field] = "{$label} is not a valid phone number";
            }
        }
        return $this;
    }

    /**
     * Check if validation passed.
     */
    public function passes(): bool
    {
        return empty($this->errors);
    }

    /**
     * Check if validation failed.
     */
    public function fails(): bool
    {
        return !$this->passes();
    }

    /**
     * Get all validation errors.
     */
    public function errors(): array
    {
        return $this->errors;
    }

    /**
     * Get the first error message.
     */
    public function firstError(): string
    {
        return !empty($this->errors) ? reset($this->errors) : '';
    }

    /**
     * Reset errors for reuse.
     */
    public function reset(): self
    {
        $this->errors = [];
        return $this;
    }
}
