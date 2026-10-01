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
  await exportToCsv(columns, rows, 'export.csv');
  return file ? file.text() : '';
}

describe('exportToCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('quotes cells with a comma, a quote or a line break and doubles inner quotes', async () => {
    const columns = [
      { key: 'name', name: 'Name' },
      { key: 'message', name: 'Message' },
    ];
    const rows = [
      { name: 'Plain', message: 'Say "hi"' },
      { name: 'Smith, Jo', message: 'first line\nsecond line' },
    ];

    expect(await csvText(columns, rows)).toBe(
      ['Name,Message', 'Plain,"Say ""hi"""', '"Smith, Jo","first line\nsecond line"'].join('\n'),
    );
  });

  it('writes a list as one quoted cell', async () => {
    const rows = [{ labels: ['bug', 'ui'] }, { labels: ['solo'] }];

    expect(await csvText([{ key: 'labels', name: 'Labels' }], rows)).toBe(['Labels', '"bug, ui"', 'solo'].join('\n'));
  });
});
