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

function colWidths(headers: string[], rows: (string | number)[][]): number[] {
    return headers.map((h, i) => {
        let w = h.length;

        for (const r of rows) {
            w = Math.max(w, String(r[i] ?? '').length);
        }

        // ponytail: min ~10, max ~30 char — đủ đẹp cho mọi cột báo cáo.
        return Math.min(30, Math.max(10, w));
    });
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

export async function exportXLSX(
    title: string,
    dateRange: string,
    headers: string[],
    rows: (string | number)[][],
    baseName: string,
): Promise<void> {
    // ponytail: lazy import ~0.9MB chỉ khi user bấm export; caller try/catch hiển thị lỗi offline.
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
        [title],
        [dateRange],
        [],
        headers,
        ...rows,
    ]);

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    ];
    ws['!cols'] = colWidths(headers, rows).map((wch) => ({ wch }));

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo');
    XLSX.writeFile(wb, filename(baseName, 'xlsx'));
}
