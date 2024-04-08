import type { ReactElement } from 'react';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import type { Theme } from '~/store/theme';

dayjs.extend(localizedFormat);

// Export table data to CSV
export async function exportToCsv<R>(columns: { key: string; name: ReactElement | string }[], rows: R[], fileName: string) {
  if (!rows.length) return;

  const preparedColumns = columns.filter((column) => column.name);
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = rows.map((row) => preparedColumns.map((column) => row[column.key as keyof R]));
  const content = [...head, ...body].map((cells) => cells.map(serialiseCellValue).join(',')).join('\n');

  downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

export async function exportToPdf<R>(
  columns: { key: string; name: ReactElement | string }[],
  rows: R[],
  fileName: string,
  pageName: string,
  theme: Theme,
) {
  // Redo type assign into the  columns
  const preparedColumns = columns.filter((column) => (column as unknown as { visible: boolean }).visible);
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = rows.map((row) =>
    preparedColumns.map((column) => {
      if (column.key === 'adminCount' || column.key === 'memberCount') {
        const key = column.key.replace('Count', 's');
        return (row as { counts: Record<string, string> }).counts[key];
      }
      return row[column.key as keyof R];
    }),
  ) as string[][];

  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), (await import('jspdf-autotable')).default]);
  const doc = new jsPDF({
    orientation: 'l',
    unit: 'px',
  });

  // Add date of export and name of the page that is exported.
  const currentDate = dayjs();
  const exportDate = currentDate.format('lll');
  const exportInfo = `Exported from page: ${pageName}\nExport Date: ${exportDate}`;
  doc.text(exportInfo, 10, 10);

  const textColor = theme === 'dark' ? '#f2f2f2' : '#17171C';
  const backgroundColor = theme === 'dark' ? '#151519' : '#ffffff';
  const alternateBackgroundColor = theme === 'dark' ? '#2c2c2f' : '#e5e5e5';

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
