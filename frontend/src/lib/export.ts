import type { ReactElement } from 'react';

// Export table data to CSV
export async function exportToCsv<R>(columns: { key: string; name: ReactElement | string }[], rows: R[], fileName: string) {
  if (!rows.length) return;

  const preparedColumns = columns.filter((column) => column.name);
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = rows.map((row) => preparedColumns.map((column) => row[column.key as keyof R]));
  const content = [...head, ...body].map((cells) => cells.map(serialiseCellValue).join(',')).join('\n');

  downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

// Export table data to PDF
export async function exportToPdf<R>(columns: { key: string; name: ReactElement | string }[], rows: R[], fileName: string) {
  const preparedColumns = columns.filter((column) => column.name);
  const head = [preparedColumns.map((column) => String(column.name))];
  const body = rows.map((row) => preparedColumns.map((column) => row[column.key as keyof R])) as string[][];

  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), (await import('jspdf-autotable')).default]);
  const doc = new jsPDF({
    orientation: 'l',
    unit: 'px',
  });

  autoTable(doc, {
    head,
    body,
    horizontalPageBreak: true,
    styles: { cellPadding: 1.5, fontSize: 8, cellWidth: 'wrap' },
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
