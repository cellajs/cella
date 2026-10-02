import { describe, expect, it } from 'vitest';
import { blockPlainText, countDescriptionBlocks, type DescriptionBlock, deriveDocument, findSummarySource } from './derive-description-core.ts';

const paragraph = (text: string): DescriptionBlock => ({
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text }],
});

const checklist = (checked: boolean, text = 'todo'): DescriptionBlock => ({
  type: 'checklistItem',
  props: { checked },
  content: [{ type: 'text', text }],
});

const media = (type: string, url: string, attachmentId = ''): DescriptionBlock => ({ type, props: { url, attachmentId, name: 'file' } });

describe('countDescriptionBlocks', () => {
  it('counts checkboxes, media blocks, and collects unique attachment ids in document order', () => {
    const counts = countDescriptionBlocks([
      paragraph('intro'),
      checklist(true),
      checklist(false),
      media('image', 'a-1', 'a-1'),
      media('file', 'seed/doc.pdf', 'a-2'),
      // External media URL: counted, but contributes no attachment id
      media('video', 'https://example.com/clip.mp4'),
      // Duplicate reference stays unique
      media('image', 'a-1', 'a-1'),
    ]);

    expect(counts.checkboxCount).toBe(2);
    expect(counts.checkedCount).toBe(1);
    expect(counts.attachmentCount).toBe(4);
    expect(counts.attachments).toEqual(['a-1', 'a-2']);
    expect(counts.expandable).toBe(true);
  });

  it('walks nested children', () => {
    const counts = countDescriptionBlocks([{ ...paragraph('parent'), children: [media('image', 'a-9', 'a-9'), checklist(true)] }]);
    expect(counts.attachments).toEqual(['a-9']);
    expect(counts.checkboxCount).toBe(1);
    expect(counts.expandable).toBe(false);
  });

  it('ignores media blocks with empty or blank references', () => {
    const counts = countDescriptionBlocks([media('image', '', ''), media('video', '  ')]);
    expect(counts.attachmentCount).toBe(0);
    expect(counts.attachments).toEqual([]);
  });
});

describe('findSummarySource', () => {
  it('prefers the first non-checklist block with text and reports its plain-text length', () => {
    const { source, summaryLength } = findSummarySource([checklist(true, 'skip me'), paragraph('summary here')]);
    expect(source?.type).toBe('paragraph');
    expect(summaryLength).toBe('summary here'.length);
  });

  it('falls back to the first block when nothing else has text', () => {
    const { source } = findSummarySource([checklist(false, 'only checklist')]);
    expect(source?.type).toBe('checklistItem');
    expect(blockPlainText(source as DescriptionBlock)).toBe('only checklist');
  });
});

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

const mention = (id: string, name = 'someone') => ({ type: 'mention', props: { id, name, slug: name } });

describe('deriveDocument', () => {
  it('reads the title from block 0 and the search text from every block', () => {
    const derived = deriveDocument(
      JSON.stringify([
        { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '  Sprint retro ' }] },
        paragraph('went   well'),
        media('image', 'https://example.com/docs/plan.png', 'a-1'),
      ]),
    );
    expect(derived.name).toBe('Sprint retro');
    expect(derived.keywords).toBe('Sprint retro went well file example.com example docs plan.png');
    expect(derived.keywords.match(/Sprint retro/g)).toHaveLength(1);
  });

  it('caps the search text at 900 characters', () => {
    expect(deriveDocument(JSON.stringify([paragraph('x '.repeat(2000))])).keywords).toHaveLength(900);
  });

  it('collects media attachment ids into attachments and counts', () => {
    const derived = deriveDocument(
      JSON.stringify([
        media('image', 'a-1', 'a-1'),
        { ...paragraph('parent'), children: [media('file', 'seed/doc.pdf', 'a-2'), media('image', 'a-1', 'a-1')] },
        media('video', 'https://example.com/clip.mp4'),
      ]),
    );
    expect(derived.attachments).toEqual(['a-1', 'a-2']);
    expect(derived.counts).toEqual({ expandable: true, checkboxCount: 0, checkedCount: 0, attachmentCount: 4, attachments: ['a-1', 'a-2'] });
  });

  it('counts checklist items, nested ones included', () => {
    const { counts } = deriveDocument(JSON.stringify([checklist(true), { ...checklist(false), children: [checklist(true)] }]));
    expect(counts).toMatchObject({ checkboxCount: 3, checkedCount: 2 });
  });

  it('finds mention nodes at any depth, unique and in document order', () => {
    const derived = deriveDocument(
      JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, mention(alice, 'Alice')] },
        {
          type: 'bulletListItem',
          content: [],
          children: [{ type: 'paragraph', content: [mention(bob, 'Bob'), mention(alice, 'Alice')] }],
        },
      ]),
    );
    expect(derived.mentions).toEqual([alice, bob]);
    expect(derived.keywords).toBe('Hi @Alice @Bob @Alice');
  });

  it('reads mentions from the spans of an HTML body, which has no blocks', () => {
    const html = `<p>Hi <span data-mention-id="${alice}">@ Alice</span> and <span data-mention-id="${alice}">@ A</span></p>`;
    expect(deriveDocument(html)).toMatchObject({ name: '', keywords: '', attachments: [], mentions: [alice] });
  });

  it('ignores mention ids that are not UUIDs, so a hand-written node or attribute names no recipient', () => {
    expect(deriveDocument('<span data-mention-id="not-a-uuid">@ X</span>').mentions).toEqual([]);
    expect(deriveDocument(JSON.stringify([{ type: 'paragraph', content: [mention('not-a-uuid')] }])).mentions).toEqual([]);
  });

  it('derives nothing from an empty, absent or malformed body, and never throws', () => {
    const empty = { name: '', keywords: '', summary: '', summaryLength: 0, attachments: [], mentions: [], blocks: [] };
    for (const body of [null, undefined, '', '[]', '<p>no mentions here</p>', '[{"type":', '{"type":"heading"}']) {
      expect(deriveDocument(body)).toMatchObject(empty);
      expect(deriveDocument(body).counts.attachmentCount).toBe(0);
    }
    const { blocks: _blocks, ...malformed } = empty;
    expect(deriveDocument('[null, {"type": "paragraph", "children": [null]}]')).toMatchObject(malformed);
  });
});

describe('deriveDocument summary', () => {
  const summaryOf = (blocks: DescriptionBlock[]) => deriveDocument(JSON.stringify(blocks));
  const emptyParagraph: DescriptionBlock = { type: 'paragraph', props: {}, content: [] };

  it('is the first block with text, as a one-block document, with its plain-text length', () => {
    const first = {
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: 'Ship ' },
        { type: 'text', text: 'it', styles: { bold: true } },
      ],
    };
    const derived = summaryOf([first, paragraph('second')]);
    expect(derived.summary).toBe(JSON.stringify([first]));
    expect(JSON.parse(derived.summary)).toEqual([first]);
    expect(derived.summaryLength).toBe('Ship it'.length);
  });

  it('skips checklist items, and falls back to the first block when they are all there is', () => {
    expect(summaryOf([checklist(true, 'skip me'), paragraph('the summary')]).summary).toBe(JSON.stringify([paragraph('the summary')]));
    const onlyChecklist = summaryOf([checklist(false, 'first'), checklist(true, 'second')]);
    expect(onlyChecklist.summary).toBe(JSON.stringify([checklist(false, 'first')]));
    expect(onlyChecklist.summaryLength).toBe('first'.length);
  });

  it('skips a leading image or empty paragraph', () => {
    const image = media('image', 'https://example.com/a.png');
    expect(summaryOf([image, paragraph('caption')]).summary).toBe(JSON.stringify([paragraph('caption')]));
    expect(summaryOf([emptyParagraph, paragraph('body')]).summary).toBe(JSON.stringify([paragraph('body')]));
  });

  it('is the first block, with length 0, when no block has text', () => {
    const image = media('image', 'https://example.com/a.png');
    expect(summaryOf([image, emptyParagraph])).toMatchObject({ summary: JSON.stringify([image]), summaryLength: 0 });
  });

  it('is empty for an empty, malformed or non-block description', () => {
    for (const body of [null, '', '[]', '[{"type":', '<p>legacy html</p>', '{"type":"paragraph"}', '[null]', '["text"]']) {
      expect(deriveDocument(body)).toMatchObject({ summary: '', summaryLength: 0 });
    }
  });
});
