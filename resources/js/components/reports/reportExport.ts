import { pad2 } from '../../utils/date';

function escapeCell(v: string | number): string {
    return `"${String(v).replace(/"/g, '""')}"`;
}

export function buildCSV(
    title: string,
    dateRange: string,
    headers: string[],
    rows: (string | number)[][],
): string {
    const lines = [[title], [dateRange], [], headers, ...rows].map((r) =>
        r.map(escapeCell).join(','),
    );

    return '\uFEFF' + lines.join('\r\n');
}

function filename(baseName: string, ext: string): string {
    const n = new Date();
    const stamp = `${n.getFullYear()}${pad2(n.getMonth() + 1)}${pad2(n.getDate())}_${pad2(n.getHours())}${pad2(n.getMinutes())}`;

    return `${baseName}_${stamp}.${ext}`;
}

function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportCSV(
    title: string,
    dateRange: string,
    headers: string[],
    rows: (string | number)[][],
    baseName: string,
) {
    download(
        new Blob([buildCSV(title, dateRange, headers, rows)], {
            type: 'text/csv;charset=utf-8',
        }),
        filename(baseName, 'csv'),
    );
}

const YELLOW_BG = 'FFD966';
const LIGHT_YELLOW_BG = 'FFF2CC';
const BLUE_BG = '4472C4';
const BORDER_COLOR = 'D4D4D8';

function autoColWidth(
    headers: string[],
    rows: (string | number)[][],
): number[] {
    return headers.map((h, i) => {
        let w = h.length;

        for (const r of rows) {
            w = Math.max(w, String(r[i] ?? '').length);
        }

        return Math.min(40, Math.max(10, Math.ceil(w * 1.2)));
    });
}

export async function exportXLSX(
    title: string,
    dateRange: string,
    headers: string[],
    rows: (string | number)[][],
    baseName: string,
): Promise<void> {
    // ponytail: lazy import ~1MB exceljs chỉ khi user bấm export; caller try/catch hiển thị lỗi offline.
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Báo cáo');

    const nCols = headers.length;

    // Row 1: title (merged, bold, centered, yellow bg)
    ws.addRow([title]);
    ws.mergeCells(1, 1, 1, nCols);
    const titleRow = ws.getRow(1);
    titleRow.height = 28;
    titleRow.getCell(1).alignment = {
        horizontal: 'center',
        vertical: 'middle',
    };
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: YELLOW_BG },
    };

    // Row 2: date range (merged, centered, light yellow bg)
    ws.addRow([dateRange]);
    ws.mergeCells(2, 1, 2, nCols);
    const dateRow = ws.getRow(2);
    dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dateRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LIGHT_YELLOW_BG },
    };

    // Row 3: blank
    ws.addRow([]);

    // Row 4: headers (blue bg, white bold, centered)
    ws.addRow(headers);
    const headerRow = ws.getRow(4);
    headerRow.height = 22;

    for (let c = 1; c <= nCols; c++) {
        const cell = headerRow.getCell(c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: BLUE_BG },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: BORDER_COLOR } },
            bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
            left: { style: 'thin', color: { argb: BORDER_COLOR } },
            right: { style: 'thin', color: { argb: BORDER_COLOR } },
        };
    }

    // Data rows
    for (const row of rows) {
        const excelRow = ws.addRow(row);

        for (let c = 1; c <= nCols; c++) {
            const cell = excelRow.getCell(c);
            cell.border = {
                top: { style: 'thin', color: { argb: BORDER_COLOR } },
                bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
                left: { style: 'thin', color: { argb: BORDER_COLOR } },
                right: { style: 'thin', color: { argb: BORDER_COLOR } },
            };
            cell.alignment = { vertical: 'middle' };
        }
    }

    // Auto-fit column widths
    const widths = autoColWidth(headers, rows);

    for (let c = 1; c <= nCols; c++) {
        ws.getColumn(c).width = widths[c - 1];
    }

    // Find and style "Tổng cộng" row (last data row)
    const lastDataRow = ws.lastRow;

    if (lastDataRow) {
        const firstCell = lastDataRow.getCell(1);

        if (String(firstCell.value) === 'Tổng cộng') {
            lastDataRow.height = 24;
            // Merge columns A-F for "Tổng cộng" label
            ws.mergeCells(lastDataRow.number, 1, lastDataRow.number, nCols - 2);
            firstCell.alignment = { horizontal: 'right', vertical: 'middle' };

            for (let c = 1; c <= nCols; c++) {
                const cell = lastDataRow.getCell(c);
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: YELLOW_BG },
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: BORDER_COLOR } },
                    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
                    left: { style: 'thin', color: { argb: BORDER_COLOR } },
                    right: { style: 'thin', color: { argb: BORDER_COLOR } },
                };
            }
        }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    download(blob, filename(baseName, 'xlsx'));
}
