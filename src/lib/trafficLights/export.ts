import * as XLSX from 'xlsx';
import type { TrafficRow } from './calc';
import { LIGHT_LABEL } from './score';

export const EXPORT_HEADERS = [
  'Sr. No.',
  'Name',
  'Total Score',
  'Colour',
  'Attendance Rate',
  'Attendance Score',
  'CEU Rate',
  'CEU Score',
  '121 Rate',
  '121 Score',
  'Referrals Given Rate',
  'Referrals Given Score',
  'TYFCB',
  'TYFCB Score',
  'Visitors',
  'Visitor Score',
  'Sponsors',
  'Sponsor Score',
];

const r4 = (n: number | null): number | '' => (n === null ? '' : Math.round(n * 10000) / 10000);

/** One export line per member, numbers as numbers (rates to 4 decimals like BNI's sheet). */
export function exportLines(rows: TrafficRow[]): (string | number)[][] {
  return rows.map((r, i) => [
    i + 1,
    r.name,
    r.total,
    LIGHT_LABEL[r.color],
    r4(r.attendance.rate),
    r.attendance.score,
    r4(r.ceu.rate),
    r.ceu.score,
    r4(r.oneToOne.rate),
    r.oneToOne.score,
    r4(r.referrals.rate),
    r.referrals.score,
    Math.round(r.tyfcb.amount),
    r.tyfcb.score,
    r.visitors.count,
    r.visitors.score,
    r.sponsors.count,
    r.sponsors.score,
  ]);
}

const csvCell = (v: string | number): string => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);

/** CSV text: title, window, header, lines. */
export function exportCsv(rows: TrafficRow[], title: string, windowLabel: string): string {
  return [csvCell(title), csvCell(windowLabel), EXPORT_HEADERS.map(csvCell).join(','), ...exportLines(rows).map((l) => l.map(csvCell).join(','))].join('\n');
}

export const safeFilePart = (s: string): string => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadCsv(rows: TrafficRow[], title: string, windowLabel: string, filename: string): void {
  download(new Blob([exportCsv(rows, title, windowLabel)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export function downloadXlsx(rows: TrafficRow[], title: string, windowLabel: string, filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet([[title], [windowLabel], EXPORT_HEADERS, ...exportLines(rows)]);
  ws['!cols'] = EXPORT_HEADERS.map((h, i) => ({ wch: i === 1 ? 28 : Math.max(10, Math.min(18, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Traffic Lights');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Position of the "Colour" column in EXPORT_HEADERS / exportLines. */
const COLOUR_COLUMN = 3;

// The Total Score cell is filled with the member's light, like the dots on screen.
const LIGHT_RGB: Record<TrafficRow['color'], [number, number, number]> = {
  green: [34, 197, 94],
  amber: [245, 158, 11],
  red: [239, 68, 68],
  grey: [156, 163, 175],
};

/** PDF (landscape): title, window, member count, then the table. The PDF libraries load only when this is used. */
export async function downloadPdf(rows: TrafficRow[], title: string, windowLabel: string, filename: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text(title, 30, 30);
  doc.setFontSize(8);
  doc.setTextColor(110, 105, 95);
  doc.text(`${windowLabel} · ${rows.length} members`, 30, 44);
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 52,
    // The light is the fill of the Total Score cell, so the separate Colour column (index 3) is left out of the PDF.
    head: [EXPORT_HEADERS.filter((_, i) => i !== COLOUR_COLUMN)],
    body: exportLines(rows).map((l) => l.filter((_, i) => i !== COLOUR_COLUMN).map((v) => String(v))),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 6, halign: 'center', cellPadding: 2 },
    headStyles: { fillColor: [214, 84, 44], textColor: 255 },
    columnStyles: { 1: { halign: 'left', cellWidth: 70 } },
    didParseCell: (h) => {
      if (h.section === 'body' && h.column.index === 2) {
        const c = LIGHT_RGB[rows[h.row.index]?.color];
        if (c) {
          h.cell.styles.fillColor = c;
          h.cell.styles.textColor = 255;
          h.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  doc.save(`${filename}.pdf`);
}
