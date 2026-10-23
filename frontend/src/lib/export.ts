import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import i18n from 'i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Mode } from '~/modules/ui/ui-store';

dayjs.extend(localizedFormat);

// biome-ignore lint/suspicious/noExplicitAny: any is required here
type Row = Record<string, any>;

/** A date as an export writes it, for a column's `exportValue`; a missing date stays missing. */
export const exportDate = (date?: string | number | Date | null) => (date ? dayjs.utc(date).local().format('lll') : null);

/** Exports visible table columns/rows to a downloadable CSV file. */
export function exportToCsv<R extends Row>(columns: ColumnOrColumnGroup<R>[], rows: R[], fileName: string) {
  if (!rows.length) return;

  const { head, body } = toTable(columns, rows);
  const content = [...head, ...body].map((cells) => cells.map(serialiseCellValue).join(',')).join('\n');

  downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

/** Exports visible table columns/rows to a PDF styled for `mode`, with a page-name and export-date header. */
export async function exportToPdf<R extends Row>(columns: ColumnOrColumnGroup<R>[], rows: R[], fileName: string, pageName: string, mode: Mode) {
  const { head, body } = toTable(columns, rows);

  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), (await import('jspdf-autotable')).default]);
  const doc = new jsPDF({ orientation: 'l', unit: 'px' });

  const exportInfo = `${i18n.t('c:exported_from', { page: pageName })}\n${i18n.t('c:export_date', { date: exportDate(Date.now()) })}`;
  doc.text(exportInfo, 10, 10);

  const textColor = mode === 'dark' ? '#f2f2f2' : '#17171C';
  const backgroundColor = mode === 'dark' ? '#151519' : '#ffffff';
  const alternateBackgroundColor = mode === 'dark' ? '#2c2c2f' : '#e5e5e5';

  autoTable(doc, {
    head,
    body,
    startY: 40,
    horizontalPageBreak: true,
    styles: { cellPadding: 1.5, fontSize: 10, cellWidth: 'wrap', textColor, fillColor: backgroundColor },
    bodyStyles: { fillColor: backgroundColor },
    alternateRowStyles: { fillColor: alternateBackgroundColor },
    tableWidth: 'wrap',
  });
  doc.save(fileName);
}

/** The header row and the body rows of the columns the export shows. */
const toTable = <R extends Row>(columns: ColumnOrColumnGroup<R>[], rows: R[]) => {
  const shown = columns.filter((column) => filterColumns(column));
  return { head: [shown.map((column) => String(column.name))], body: formatBodyData(rows, shown) };
};

const formatRowData = <R extends Row>(row: R, column: ColumnOrColumnGroup<R>) =>
  (column.exportValue ? column.exportValue(row) : row[column.key]) ?? '-';

const formatBodyData = <R extends Row>(rows: R[], columns: ColumnOrColumnGroup<R>[]): (string | number)[][] => {
  return rows.map((row) => columns.map((column) => formatRowData(row, column)));
};

/** Exports the columns the table shows, leaving out the nameless ones (selection and action columns). */
const filterColumns = <R extends Row>(column: ColumnOrColumnGroup<R>) => !column.hidden && column.name !== '';

/** A cell with a comma, quote or line break is quoted with its quotes doubled (RFC 4180); a list is one cell. */
function serialiseCellValue(value: unknown) {
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Saves a blob as a file through a download link. */
export function downloadFile(fileName: string, data: Blob) {
  const downloadLink = document.createElement('a');
  downloadLink.download = fileName;
  const url = URL.createObjectURL(data);
  downloadLink.href = url;
  downloadLink.click();
  // Safari aborts a download whose blob URL is revoked in the same task.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
