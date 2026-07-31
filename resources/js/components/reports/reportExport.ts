import { pad2 } from '../../utils/date';

function escapeCell(v: string | number): string {
    return `"${String(v).replace(/"/g, '""')}"`;
}

export function buildCSV(
    headers: string[],
    rows: (string | number)[][],
): string {
    const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(','));

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
    headers: string[],
    rows: (string | number)[][],
    baseName: string,
) {
    download(
        new Blob([buildCSV(headers, rows)], {
            type: 'text/csv;charset=utf-8',
        }),
        filename(baseName, 'csv'),
    );
}

export async function exportXLSX(
    headers: string[],
    rows: (string | number)[][],
    baseName: string,
): Promise<void> {
    // ponytail: lazy import ~0.9MB chỉ khi user bấm export; caller try/catch hiển thị lỗi offline.
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo');
    XLSX.writeFile(wb, filename(baseName, 'xlsx'));
}
