<?php

use App\Support\SpreadsheetCellSanitizer;

it('neutralizes spreadsheet formulas', function (string $input) {
    expect(SpreadsheetCellSanitizer::sanitize($input))->toStartWith("'");
})->with([
    '=1+1',
    '=HYPERLINK("http://evil.example","click")',
    '+SUM(A1:A2)',
    '-1+1',
    '@SUM(1+1)',
    '@cmd',
    "\tformula",
    "\rformula",
    "\nformula",
]);

it('leaves safe values untouched', function (mixed $input) {
    expect(SpreadsheetCellSanitizer::sanitize($input))->toBe($input);
})->with([
    'Cà phê đen đá',
    '25000',
    '0',
    '',
    0,
    25000,
    12.5,
    true,
    false,
    null,
]);

it('sanitizes each cell of a row', function () {
    expect(SpreadsheetCellSanitizer::sanitizeRow([1, '=1+1', 'safe', null]))->toBe([1, "'=1+1", 'safe', null]);
});
