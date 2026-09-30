import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Mode } from '~/modules/ui/ui-store';

dayjs.extend(localizedFormat);

// biome-ignore lint/suspicious/noExplicitAny: any is required here
type Row = Record<string, any>;

/** A date as an export writes it, for a column's `exportValue`; a missing date stays missing. */
export const exportDate = (date?: string | number | Date | null) =>
  date ? dayjs.utc(date).local().format('lll') : null;

/** Exports visible table columns/rows to a downloadable CSV file. */
export async function exportToCsv<R extends Row>(columns: ColumnOrColumnGroup<R>[], rows: R[], fileName: string) {
  if (!rows.length) return;

  const preparedColumns = columns.filter((column) => filterColumns(column));
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = formatBodyData(rows, preparedColumns);
  const content = [...head, ...body].map((cells) => cells.map(serialiseCellValue).join(',')).join('\n');

  downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

/** Exports visible table columns/rows to a PDF styled for `mode`, with a page-name and export-date header. */
export async function exportToPdf<R extends Row>(
  columns: ColumnOrColumnGroup<R>[],
  rows: R[],
  fileName: string,
  pageName: string,
  mode: Mode,
) {
  const preparedColumns = columns.filter((column) => filterColumns(column));
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = formatBodyData(rows, preparedColumns);

  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), (await import('jspdf-autotable')).default]);
  const doc = new jsPDF({
    orientation: 'l',
    unit: 'px',
  });

  const exportDate = dayjs().format('lll');
  const exportInfo = `Exported from page: ${pageName}\nExport Date: ${exportDate}`;
  doc.text(exportInfo, 10, 10);

  const textColor = mode === 'dark' ? '#f2f2f2' : '#17171C';
  const backgroundColor = mode === 'dark' ? '#151519' : '#ffffff';
  const alternateBackgroundColor = mode === 'dark' ? '#2c2c2f' : '#e5e5e5';

  autoTable(doc, {
    head,
    body,
    startY: 40,
    horizontalPageBreak: true,
    styles: {
      cellPadding: 1.5,
      fontSize: 10,
      cellWidth: 'wrap',
      textColor,
      fillColor: backgroundColor,
    },
    bodyStyles: {
      fillColor: backgroundColor,
    },
    alternateRowStyles: { fillColor: alternateBackgroundColor },
    tableWidth: 'wrap',
  });
  doc.save(fileName);
}

const formatRowData = <R extends Row>(row: R, column: ColumnOrColumnGroup<R>) =>
  (column.exportValue ? column.exportValue(row) : row[column.key]) ?? '-';

const formatBodyData = <R extends Row>(rows: R[], columns: ColumnOrColumnGroup<R>[]): (string | number)[][] => {
  return rows.map((row) => columns.map((column) => formatRowData(row, column)));
};

/** Exports the columns the table shows, leaving out selection and nameless (action) columns. */
const filterColumns = <R extends Row>(column: ColumnOrColumnGroup<R>) => {
  const invalidColumnKeys = ['subscription', 'checkbox-column'];
  return !column.hidden && !invalidColumnKeys.includes(column.key) && column.name !== '';
};

function serialiseCellValue(value: unknown) {
  if (typeof value === 'string') {
    const formattedValue = value.replace(/"/g, '""');
    return formattedValue.includes(',') ? `"${formattedValue}"` : formattedValue;
  }
  return value;
}

function downloadFile(fileName: string, data: Blob) {
  const downloadLink = document.createElement('a');
  downloadLink.download = fileName;
  const url = URL.createObjectURL(data);
  downloadLink.href = url;
  downloadLink.click();
  URL.revokeObjectURL(url);
}
