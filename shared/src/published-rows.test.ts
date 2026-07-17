import { describe, expect, it } from 'vitest';
import { draftVisibleTo, isUnpublishedDraft } from './published-rows';

describe('isUnpublishedDraft', () => {
  it('is true only for an explicit null publishedAt', () => {
    expect(isUnpublishedDraft({ publishedAt: null })).toBe(true);
    expect(isUnpublishedDraft({ publishedAt: '2026-07-01T00:00:00Z' })).toBe(false);
  });

  it('treats an absent column (tables without the lifecycle) as published', () => {
    expect(isUnpublishedDraft({ id: 'row-1' })).toBe(false);
    expect(isUnpublishedDraft({ publishedAt: undefined })).toBe(false);
  });

  it('treats a missing row as published (fail-open to the engine, which fail-closes)', () => {
    expect(isUnpublishedDraft(null)).toBe(false);
    expect(isUnpublishedDraft(undefined)).toBe(false);
  });
});

describe('draftVisibleTo', () => {
  const draft = { publishedAt: null, createdBy: 'author-1' };

  it('published rows are visible to anyone (the engine decides the rest)', () => {
    expect(draftVisibleTo({ publishedAt: '2026-07-01T00:00:00Z', createdBy: 'author-1' }, 'other')).toBe(true);
    expect(draftVisibleTo({ id: 'no-column' }, undefined)).toBe(true);
  });

  it('a draft is visible to its author alone', () => {
    expect(draftVisibleTo(draft, 'author-1')).toBe(true);
    expect(draftVisibleTo(draft, 'other-user')).toBe(false);
  });

  it('fail-closed: anonymous actors and unattributed drafts match nobody', () => {
    expect(draftVisibleTo(draft, undefined)).toBe(false);
    expect(draftVisibleTo(draft, null)).toBe(false);
    expect(draftVisibleTo(draft, '')).toBe(false);
    expect(draftVisibleTo({ publishedAt: null, createdBy: null }, 'author-1')).toBe(false);
    expect(draftVisibleTo({ publishedAt: null }, 'author-1')).toBe(false);
  });
});
