<?php

namespace App\Support;

final class SpreadsheetCellSanitizer
{
    /**
     * Neutralize spreadsheet formula injection (OWASP CSV Injection).
     * Prefixes ' on strings starting with = + - @ tab CR so Excel/Sheets
     * treat the cell as text. Non-strings pass through untouched.
     */
    public static function sanitize(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        return match ($value[0]) {
            '=', '+', '-', '@', "\t", "\r" => "'".$value,
            default => $value,
        };
    }

    /**
     * @param  array<int, mixed>  $row
     * @return array<int, mixed>
     */
    public static function sanitizeRow(array $row): array
    {
        return array_map(self::sanitize(...), $row);
    }
}
