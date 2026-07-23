import { describe, expect, it } from 'vitest';
import { blockPlainText, countDescriptionBlocks, type DescriptionBlock, findSummarySource } from './derive-description-core';

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

const media = (type: string, url: string, attachmentId = ''): DescriptionBlock => ({
  type,
  props: { url, attachmentId, name: 'file' },
});

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
    const counts = countDescriptionBlocks([
      { ...paragraph('parent'), children: [media('image', 'a-9', 'a-9'), checklist(true)] },
    ]);
    expect(counts.attachments).toEqual(['a-9']);
    expect(counts.checkboxCount).toBe(1);
    expect(counts.expandable).toBe(false);
  });

  it('ignores media blocks with empty references', () => {
    const counts = countDescriptionBlocks([media('image', '', '')]);
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
