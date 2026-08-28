import { describe, expect, it } from 'vitest';
import { extractMentionIds } from './extract-mentions';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

describe('extractMentionIds', () => {
  it('reads ids from stored HTML, which is what comment and item bodies contain', () => {
    const html = `<p>Hi <span data-mention-id="${alice}">@ Alice</span>, see this</p>`;
    expect(extractMentionIds(html)).toEqual([alice]);
  });

  it('reads ids from BlockNote JSON, so a body saved as blocks still resolves', () => {
    const blocks = JSON.stringify([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hi ' },
          { type: 'mention', props: { id: alice, name: 'Alice', slug: 'alice' } },
        ],
      },
    ]);
    expect(extractMentionIds(blocks)).toEqual([alice]);
  });

  it('finds mentions nested inside child blocks', () => {
    const blocks = JSON.stringify([
      {
        type: 'bulletListItem',
        content: [],
        children: [{ type: 'paragraph', content: [{ type: 'mention', props: { id: bob } }] }],
      },
    ]);
    expect(extractMentionIds(blocks)).toEqual([bob]);
  });

  it('deduplicates a user mentioned twice', () => {
    const html = `<span data-mention-id="${alice}">@ A</span><span data-mention-id="${alice}">@ A</span>`;
    expect(extractMentionIds(html)).toEqual([alice]);
  });

  it('ignores non-uuid ids, so a hand-written attribute cannot inject a recipient', () => {
    expect(extractMentionIds('<span data-mention-id="not-a-uuid">@ X</span>')).toEqual([]);
  });

  it('returns nothing for empty or absent bodies', () => {
    expect(extractMentionIds(null)).toEqual([]);
    expect(extractMentionIds('')).toEqual([]);
    expect(extractMentionIds('<p>no mentions here</p>')).toEqual([]);
  });

  it('never throws on malformed JSON: a bad body must not fail the write it is derived from', () => {
    expect(extractMentionIds('[{"type":')).toEqual([]);
  });
});
