import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import type { ReactElement } from 'react';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Mode } from '~/store/theme';

dayjs.extend(localizedFormat);

// biome-ignore lint/suspicious/noExplicitAny: any is required here
type Row = Record<string, any>;
type Column = ColumnOrColumnGroup<Row>;
/**
 * Exports table data to a CSV file.
 *
 * Filters columns, formats rows, serializes cell values, and creates a CSV file.CSV content is then
 * downloaded with provided file name.
 *
 * @param columns - Column definitions (key and name) for table.
 * @param rows - Data rows to be displayed in table.
 * @param fileName - Name of generated CSV file.
 *
 * @returns A promise that resolves when CSV is downloaded.
 */
export async function exportToCsv<R extends Row>(columns: { key: string; name: ReactElement | string }[], rows: R[], fileName: string) {
  if (!rows.length) return;

  const preparedColumns = columns.filter((column) => filterColumns(column));
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = formatBodyData(rows, preparedColumns);
  const content = [...head, ...body].map((cells) => cells.map(serialiseCellValue).join(',')).join('\n');

  downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

/**
 * Generates and exports tabular data to a PDF file, applying styling based on dark or light mode.
 *
 * Filters the columns, formats the rows into a table, and dynamically imports `jsPDF` and `jspdf-autotable`
 * to create and style PDF. Export includes metadata like the page name and export date. PDF is
 * saved with the provided filename.
 *
 * @param columns - Column definitions (key and name) for table.
 * @param rows - Data rows to be displayed in table.
 * @param fileName - Name of generated PDF file.
 * @param pageName - Name of page from which data is exported.
 * @param mode - Mode `"dark" | "light"` to determine color scheme.
 *
 * @returns A promise that resolves when PDF is saved.
 */
export async function exportToPdf<R extends Row>(
  columns: { key: string; name: ReactElement | string }[],
  rows: R[],
  fileName: string,
  pageName: string,
  mode: Mode,
) {
  // Redo type assign into the  columns
  const preparedColumns = columns.filter((column) => filterColumns(column));
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = formatBodyData(rows, preparedColumns);

  // Import jsPDF and jsPDF autoTable dynamically
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), (await import('jspdf-autotable')).default]);
  const doc = new jsPDF({
    orientation: 'l',
    unit: 'px',
  });

  // Add date of export and name of the page that is exported.
  const exportDate = dayjs().format('lll');
  const exportInfo = `Exported from page: ${pageName}\nExport Date: ${exportDate}`;
  doc.text(exportInfo, 10, 10);

  const textColor = mode === 'dark' ? '#f2f2f2' : '#17171C';
  const backgroundColor = mode === 'dark' ? '#151519' : '#ffffff';
  const alternateBackgroundColor = mode === 'dark' ? '#2c2c2f' : '#e5e5e5';

  // Add table to the PDF
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

// Format data for a single row based on column configuration
const formatRowData = <R extends Row>(row: R, column: Column) => {
  // Handle special cases
  if ((column.key === 'adminCount' || column.key === 'memberCount') && 'counts' in row && 'membership' in row.counts) {
    const key = column.key.replace('Count', '');
    return row.counts.membership[key];
  }
  const date = dayjs(row[column.key]);
  if (date.isValid()) {
    return date.format('lll');
  }
  return row[column.key];
};

// Format the body data based on column definitions
const formatBodyData = <R extends Row>(rows: R[], columns: Column[]): (string | number)[][] => {
  return rows.map((row) => columns.map((column) => formatRowData(row, column)));
};

// Filter columns based on visibility
const filterColumns = (column: Column) => {
  if ('visible' in column && column.key !== 'checkbox-column') return column.visible;
  return false;
};

// Serialize cell values for CSV export
function serialiseCellValue(value: unknown) {
  if (typeof value === 'string') {
    const formattedValue = value.replace(/"/g, '""');
    return formattedValue.includes(',') ? `"${formattedValue}"` : formattedValue;
  }
  return value;
}

// Trigger file download in the browser
function downloadFile(fileName: string, data: Blob) {
  const downloadLink = document.createElement('a');
  downloadLink.download = fileName;
  const url = URL.createObjectURL(data);
  downloadLink.href = url;
  downloadLink.click();
  URL.revokeObjectURL(url);
}
