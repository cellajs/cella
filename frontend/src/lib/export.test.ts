import i18n from 'i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '~/lib/dayjs';
import { exportToCsv, exportToPdf } from '~/lib/export';
import { locales } from '~/lib/i18n-locales';

/** Documents the PDF export saved: file name and raw PDF text. jspdf's own `save` writes to disk in Node. */
const savedPdfs: { name: string; pdf: string }[] = [];

vi.mock('jspdf', async (importOriginal) => {
  const { jsPDF } = await importOriginal<typeof import('jspdf')>();
  class SavingJsPDF extends jsPDF {
    constructor(...args: ConstructorParameters<typeof jsPDF>) {
      super(...args);
      const save = (name?: string) => {
        savedPdfs.push({ name: name ?? '', pdf: this.output() });
        return this;
      };
      this.save = save as unknown as InstanceType<typeof jsPDF>['save'];
    }
  }
  return { jsPDF: SavingJsPDF, default: SavingJsPDF };
});

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

  it('quotes cells with a comma, a quote or a line break and doubles inner quotes', async () => {
    const columns = [
      { key: 'name', name: 'Name' },
      { key: 'message', name: 'Message' },
    ];
    const rows = [
      { name: 'Plain', message: 'Say "hi"' },
      { name: 'Smith, Jo', message: 'first line\nsecond line' },
    ];

    expect(await csvText(columns, rows)).toBe(['Name,Message', 'Plain,"Say ""hi"""', '"Smith, Jo","first line\nsecond line"'].join('\n'));
  });

  it('writes a list as one quoted cell', async () => {
    const rows = [{ labels: ['bug', 'ui'] }, { labels: ['solo'] }];

    expect(await csvText([{ key: 'labels', name: 'Labels' }], rows)).toBe(['Labels', '"bug, ui"', 'solo'].join('\n'));
  });
});

describe('exportToPdf', () => {
  beforeAll(async () => {
    await i18n.init({ lng: 'en', resources: locales, ns: ['c'], defaultNS: 'c', interpolation: { escapeValue: false } });
  });

  it('saves a document with the page name and the table rows', async () => {
    await exportToPdf([{ key: 'name', name: 'Name' }], [{ name: 'Ada Lovelace' }], 'members.pdf', '/organization/members', 'light');

    const [saved] = savedPdfs;
    expect(saved.name).toBe('members.pdf');
    expect(saved.pdf.startsWith('%PDF-')).toBe(true);
    expect(saved.pdf).toContain('/organization/members');
    expect(saved.pdf).toContain('Ada Lovelace');
  });
});
