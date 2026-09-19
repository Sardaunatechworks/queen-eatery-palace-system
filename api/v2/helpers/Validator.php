<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Validator
 *
 * Chainable input validation for API request data.
 */

declare(strict_types=1);

namespace App\Helpers;

class Validator
{
    private array $errors = [];

    /**
     * Factory method to validate data against rule definitions.
     * Example: Validator::make($data, ['name' => 'required|min:2|max:100', 'items' => 'required|array'])
     */
     public static function make(array $data, array $rules): self
     {
         $v = new self();
         foreach ($rules as $field => $ruleStr) {
             $ruleList = is_array($ruleStr) ? $ruleStr : explode('|', (string) $ruleStr);
             foreach ($ruleList as $rule) {
                 $rule = trim($rule);
                 if ($rule === 'required') {
                     $v->required($data, $field);
                 } elseif ($rule === 'array') {
                     $v->isArray($data, $field);
                 } elseif (str_starts_with($rule, 'min:')) {
                     $min = (int) substr($rule, 4);
                     $v->minLength($data, $field, $min);
                 } elseif (str_starts_with($rule, 'max:')) {
                     $max = (int) substr($rule, 4);
                     $v->maxLength($data, $field, $max);
                 } elseif ($rule === 'email') {
                     $v->email($data, $field);
                 } elseif ($rule === 'numeric') {
                     $v->numeric($data, $field);
                 }
             }
         }
         return $v;
     }

    /**
     * Check if a field is present and not empty.
     */
    public function required(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
            $this->errors[$field] = "{$label} is required.";
        }
        return $this;
    }

    /**
     * Statically validate a date string.
     */
    public static function isValidDate(string $date, string $format = 'Y-m-d'): bool
    {
        $d = \DateTime::createFromFormat($format, $date);
        return $d && $d->format($format) === $date;
    }

    /**
     * Statically validate an email string.
     */
    public static function isValidEmail(string $email): bool
    {
        return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
    }

    /**
     * Magic static handler for backward compatibility.
     */
    public static function __callStatic(string $method, array $arguments)
    {
        if ($method === 'date' && count($arguments) >= 1 && is_string($arguments[0])) {
            return self::isValidDate($arguments[0], $arguments[1] ?? 'Y-m-d');
        }
        if ($method === 'email' && count($arguments) >= 1 && is_string($arguments[0])) {
            return self::isValidEmail($arguments[0]);
        }
        throw new \BadMethodCallException("Static method {$method} does not exist on " . __CLASS__);
    }

    /**
     * Check if a field is a valid email.
     */
    public function email(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && !filter_var($data[$field], FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = "{$label} must be a valid email address.";
        }
        return $this;
    }

    /**
     * Check minimum string length.
     */
    public function minLength(array $data, string $field, int $min, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && is_string($data[$field]) && mb_strlen(trim($data[$field])) < $min) {
            $this->errors[$field] = "{$label} must be at least {$min} characters.";
        }
        return $this;
    }

    /**
     * Check maximum string length.
     */
    public function maxLength(array $data, string $field, int $max, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && is_string($data[$field]) && mb_strlen(trim($data[$field])) > $max) {
            $this->errors[$field] = "{$label} must not exceed {$max} characters.";
        }
        return $this;
    }

    /**
     * Check if a field value is within a list of allowed values.
     */
    public function inArray(array $data, string $field, array $allowed, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && !in_array($data[$field], $allowed, true)) {
            $this->errors[$field] = "{$label} must be one of: " . implode(', ', $allowed);
        }
        return $this;
    }

    /**
     * Check if a field is an array.
     */
    public function isArray(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && !is_array($data[$field])) {
            $this->errors[$field] = "{$label} must be an array.";
        }
        return $this;
    }

    /**
     * Check if a field is a non-empty array.
     */
    public function notEmptyArray(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && (!is_array($data[$field]) || empty($data[$field]))) {
            $this->errors[$field] = "{$label} must not be empty.";
        }
        return $this;
    }

    /**
     * Check if a field is numeric.
     */
    public function numeric(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && !is_numeric($data[$field])) {
            $this->errors[$field] = "{$label} must be a number.";
        }
        return $this;
    }

    /**
     * Check if a field is a positive integer.
     */
    public function positiveInt(array $data, string $field, ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field]) && (!is_numeric($data[$field]) || (int)$data[$field] <= 0)) {
            $this->errors[$field] = "{$label} must be a positive number.";
        }
        return $this;
    }

    /**
     * Check if a field is a valid date.
     */
    public function date(array $data, string $field, string $format = 'Y-m-d', ?string $label = null): self
    {
        $label = $label ?? $this->humanize($field);
        if (isset($data[$field])) {
            $d = \DateTime::createFromFormat($format, $data[$field]);
            if (!$d || $d->format($format) !== $data[$field]) {
                $this->errors[$field] = "{$label} must be a valid date ({$format}).";
            }
        }
        return $this;
    }

    /**
     * Check if a field matches a regex pattern.
     */
    public function regex(array $data, string $field, string $pattern, string $message): self
    {
        if (isset($data[$field]) && is_string($data[$field]) && !preg_match($pattern, $data[$field])) {
            $this->errors[$field] = $message;
        }
        return $this;
    }

    /**
     * Check if validation has any errors.
     */
    public function fails(): bool
    {
        return !empty($this->errors);
    }

    /**
     * Get the first error message.
     */
    public function firstError(): string
    {
        return reset($this->errors) ?: 'Validation failed';
    }

    /**
     * Get all error messages.
     */
    public function errors(): array
    {
        return $this->errors;
    }

    /**
     * Convert field_name to "Field name".
     */
    private function humanize(string $field): string
    {
        return ucfirst(str_replace('_', ' ', $field));
    }
}
