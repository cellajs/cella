// @vitest-environment jsdom
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { blocksForExport, getHeadlessEditor } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';

const organizationId = '11111111-1111-4111-8111-111111111111';
const linkedId = '0b8e0c43-7c3c-4b1e-9a77-2f5f0c1d2e3f';
const unlinkedId = '1b8e0c43-7c3c-4b1e-9a77-2f5f0c1d2e3f';
const fileLink = (id: string) => (id === linkedId ? 'https://example.com/2ddgijh/a7' : null);

const text = (value: string) => [{ type: 'text', text: value, styles: {} }];
const block = (type: string, props: Record<string, unknown>, content?: unknown) => ({
  id: `${type}-${Math.random()}`,
  type,
  props,
  content,
  children: [],
});
const media = (type: string, url: string, name: string, caption = '') => block(type, { url, name, caption, attachmentId: url });

const markdownOf = (blocks: ReturnType<typeof block>[]) =>
  getHeadlessEditor().blocksToMarkdownLossy(blocksForExport(blocks as unknown as CustomBlock[], { organizationId, fileLink }));

describe('blocksForExport', () => {
  it('writes todos as one checklist, checked state kept', () => {
    const markdown = markdownOf([
      block('checklistItem', { checkboxId: 'a', checked: false }, text('Open todo')),
      block('checklistItem', { checkboxId: 'b', checked: true }, text('Done todo')),
    ]);

    expect(markdown).toContain('* [ ] Open todo\n* [x] Done todo');
  });

  it('writes a callout as a quote, and a code block after it keeps its fence', () => {
    const markdown = markdownOf([
      block('notify', { type: 'warning' }, text('Careful here')),
      block('codeBlock', { language: 'typescript' }, text('const a = 1;')),
    ]);

    expect(markdown).toMatch(/^> .*Careful here$/m);
    expect(markdown).toContain('\n```typescript\nconst a = 1;\n```');
  });

  it('writes a file as its link, else its name, never its attachment id', () => {
    const markdown = markdownOf([
      media('image', linkedId, 'screenshot.png', 'The bug'),
      media('file', unlinkedId, 'log.txt'),
      media('video', unlinkedId, 'repro.mp4'),
    ]);

    expect(markdown).toContain('[screenshot.png](https://example.com/2ddgijh/a7)\n\n*The bug*');
    expect(markdown).toContain('\nlog.txt\n');
    expect(markdown).toContain('\nrepro.mp4\n');
    expect(markdown).not.toContain(linkedId);
    expect(markdown).not.toContain(unlinkedId);
  });

  it('shows an image whose URL serves its bytes', () => {
    const key = `${organizationId}/user/key.webp`;

    expect(markdownOf([media('image', key, 'public.webp')])).toContain(`![public.webp](${appConfig.s3.publicCDNUrl}/${key})`);
  });

  it('writes a mention as @name and a table with its first row as header', () => {
    const mention = { type: 'mention', props: { id: 'u1', slug: 'jane', name: 'Jane' } };
    const rows = [{ cells: [text('a'), text('b')] }, { cells: [text('1'), text('2')] }];
    const markdown = markdownOf([
      block('paragraph', {}, [...text('Ping '), mention]),
      block('table', {}, { type: 'tableContent', columnWidths: [undefined, undefined], rows }),
    ]);

    expect(markdown).toContain('Ping @Jane');
    expect(markdown).toMatch(/\| a +\| b +\|\n\| -+ \| -+ \|\n\| 1 +\| 2 +\|/);
  });
});
