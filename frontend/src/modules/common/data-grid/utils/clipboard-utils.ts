import type { CalculatedColumn, CellRange } from '../types';
import { normalizeCellRange } from './cell-range-utils';

/** Cell value to clipboard string: objects use their `name` field, everything else `String(value)`. */
export function cellValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    return name != null ? String(name) : '';
  }
  return String(value);
}

/** Serializes a cell range to TSV, the standard spreadsheet clipboard format. */
export function serializeCellsToTSV<R, SR>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, SR>[],
): string {
  const normalized = normalizeCellRange(range);
  const lines: string[] = [];

  for (let rowIdx = normalized.start.rowIdx; rowIdx <= normalized.end.rowIdx; rowIdx++) {
    if (rowIdx < 0 || rowIdx >= rows.length) continue;
    const row = rows[rowIdx];
    const cells: string[] = [];

    for (let colIdx = normalized.start.idx; colIdx <= normalized.end.idx; colIdx++) {
      if (colIdx < 0 || colIdx >= columns.length) {
        cells.push('');
        continue;
      }
      const column = columns[colIdx];
      const value = row[column.key as keyof R];
      const textValue = cellValueToText(value);
      cells.push(textValue.replace(/\t/g, ' ').replace(/\n/g, ' '));
    }

    lines.push(cells.join('\t'));
  }

  return lines.join('\n');
}

export function parseTSVToCells(tsv: string): string[][] {
  if (!tsv || tsv.trim() === '') return [];

  return tsv.split('\n').map((line) => line.split('\t'));
}

/** Serializes cells to an HTML table, for rich paste targets. */
export function serializeCellsToHTML<R, SR>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, SR>[],
): string {
  const normalized = normalizeCellRange(range);
  let html = '<table>';

  for (let rowIdx = normalized.start.rowIdx; rowIdx <= normalized.end.rowIdx; rowIdx++) {
    if (rowIdx < 0 || rowIdx >= rows.length) continue;
    const row = rows[rowIdx];
    html += '<tr>';

    for (let colIdx = normalized.start.idx; colIdx <= normalized.end.idx; colIdx++) {
      if (colIdx < 0 || colIdx >= columns.length) {
        html += '<td></td>';
        continue;
      }
      const column = columns[colIdx];
      const value = row[column.key as keyof R];
      const textValue = cellValueToText(value);
      const escapedValue = textValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<td>${escapedValue}</td>`;
    }

    html += '</tr>';
  }

  html += '</table>';
  return html;
}

export function getTSVDimensions(cells: string[][]): { rows: number; cols: number } {
  if (cells.length === 0) return { rows: 0, cols: 0 };

  const maxCols = Math.max(...cells.map((row) => row.length));
  return { rows: cells.length, cols: maxCols };
}
