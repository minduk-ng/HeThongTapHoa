// Committed coverage for the CSV/XLSX formula sanitizer.
// Run: node --test resources/js/components/reports/reportExport.test.ts
// (node >= 22 type-strips .ts; tsExtResolve.hook.mjs resolves the real
// module's extensionless imports. No new deps.)
import { equal, ok } from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register('./tsExtResolve.hook.mjs', import.meta.url);

const { buildCSV, escapeCsvCell, toXlsxCell } =
    await import('./reportExport.ts');

describe('escapeCsvCell', () => {
    it('prefixes spreadsheet formula triggers', () => {
        for (const payload of [
            '=HYPERLINK("http://evil.example","click")',
            '=1+1',
            '+SUM(A1:A2)',
            '-1+1',
            '@SUM(1+1)',
            '@cmd',
            '\tformula',
            '\rformula',
        ]) {
            ok(String(escapeCsvCell(payload)).startsWith("'"), payload);
        }
    });

    it('prefixes before the value (quote-prefix form)', () => {
        equal(escapeCsvCell('=1+1'), "'=1+1");
        equal(escapeCsvCell('-1+1'), "'-1+1");
    });

    it('leaves safe values untouched', () => {
        for (const safe of ['Cà phê đen đá', '25000', '']) {
            equal(escapeCsvCell(safe), safe);
        }

        equal(escapeCsvCell(0), 0);
        equal(escapeCsvCell(25000), 25000);
        equal(escapeCsvCell(12.5), 12.5);
        equal(escapeCsvCell(true as unknown as string), true);
        equal(escapeCsvCell(false as unknown as string), false);
        equal(escapeCsvCell(null as unknown as string), null);
    });
});

describe('buildCSV', () => {
    it('neutralizes formula cells before quoting', () => {
        const csv = buildCSV(
            'T',
            'D',
            ['Name'],
            [['=HYPERLINK("http://evil.example","x")'], ['safe']],
        );

        ok(csv.includes("'=HYPERLINK"), 'prefixed payload present');
        ok(!csv.includes('"=HYPERLINK'), 'raw formula absent');
        ok(csv.includes('"safe"'), 'safe cell intact');
    });

    it('sanitizes the title path too', () => {
        ok(buildCSV('=evil', 'D', ['Name'], []).includes("'=evil"));
    });
});

describe('toXlsxCell', () => {
    it('keeps numbers numeric', () => {
        equal(toXlsxCell(0), 0);
        equal(toXlsxCell(25000), 25000);
    });

    it('writes explicit primitive strings (never formulas)', () => {
        // Title / dateRange / headers / data shapes, incl. hostile input.
        for (const cell of [
            'Báo cáo doanh thu',
            '01/01/2026 - 31/01/2026',
            'Tên sản phẩm',
            'Cà phê đen đá',
            '=HYPERLINK("http://evil.example","x")',
            '@SUM(1+1)',
            '-1+1',
        ]) {
            equal(typeof toXlsxCell(cell), 'string');
            equal(toXlsxCell(cell), cell);
        }
    });
});
