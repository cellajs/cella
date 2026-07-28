import { describe, expect, it } from 'vitest';
import { deriveDescriptionCounts } from './derive-description-props';

const block = (type: string, props: Record<string, unknown> = {}, children: unknown[] = []) => ({
  id: crypto.randomUUID(),
  type,
  props,
  content: [],
  children,
});

describe('deriveDescriptionCounts', () => {
  it('counts checklist items including checked state', () => {
    const description = JSON.stringify([
      block('checklistItem', { checkboxId: 'a', checked: true }),
      block('checklistItem', { checkboxId: 'b', checked: false }),
      block('paragraph'),
    ]);
    expect(deriveDescriptionCounts(description)).toEqual({
      expandable: true,
      checkboxCount: 2,
      checkedCount: 1,
      attachmentCount: 0,
    });
  });

  it('counts nested children depth-first', () => {
    const description = JSON.stringify([
      block('paragraph', {}, [
        block('checklistItem', { checkboxId: 'a', checked: true }, [
          block('checklistItem', { checkboxId: 'b', checked: true }),
        ]),
        block('image', { url: 'https://x/img.png' }),
      ]),
    ]);
    expect(deriveDescriptionCounts(description)).toEqual({
      expandable: false,
      checkboxCount: 2,
      checkedCount: 2,
      attachmentCount: 1,
    });
  });

  it('counts only media blocks with a non-empty url', () => {
    const description = JSON.stringify([
      block('image', { url: 'https://x/a.png' }),
      block('video', { url: '  ' }),
      block('audio', {}),
      block('file', { url: 'https://x/b.pdf' }),
    ]);
    expect(deriveDescriptionCounts(description)).toMatchObject({ attachmentCount: 2, expandable: true });
  });

  it('returns zeroed counts for invalid JSON', () => {
    expect(deriveDescriptionCounts('not json')).toEqual({
      expandable: false,
      checkboxCount: 0,
      checkedCount: 0,
      attachmentCount: 0,
    });
  });
});
