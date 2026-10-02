import type { Attachment } from 'sdk';
import { deriveDocument } from 'shared/utils/derive-description-core';
import { afterEach, describe, expect, it } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

stubLocalStorage();

const { attachmentQueryKeys } = await import('~/modules/attachment/query');
const { deriveDescriptionFields } = await import('~/modules/common/blocknote/description-derivation');
const { patchCollaborativeDescription } = await import('~/modules/common/blocknote/use-description-update');
const { getYjsOwnedFields } = await import('~/modules/common/blocknote/yjs-editor');
const { queryClient } = await import('~/query/query-client');

// Text, a link, a mention, media and a nested checklist: every kind of term the search text collects.
const description = JSON.stringify([
  { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Signed  contract' }] },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Ask ' },
      { type: 'mention', props: { id: '11111111-1111-4111-8111-111111111111', name: 'Alice', slug: 'alice' } },
      { type: 'link', href: 'https://example.com/terms', content: [{ type: 'text', text: 'the terms' }] },
    ],
    children: [{ type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'countersign' }] }],
  },
  { type: 'image', props: { url: 'https://cdn.example.com/scans/page-1.png', name: 'page-1.png' } },
]);

/** What `update-attachment.ts` stores for a written description. */
const serverKeywords = deriveDocument(description).keywords;

afterEach(() => queryClient.clear());

describe('attachment description derivation', () => {
  it('derives the keywords the server stores for the same description', () => {
    expect(serverKeywords).toContain('Signed contract');
    expect(deriveDescriptionFields('attachment', description)).toEqual({ keywords: serverKeywords });
  });

  it('patches the derived keywords into the cached row on a collaborative commit', () => {
    const row = { id: 'att-1', organizationId: 'org-1', description: null, keywords: '' } as unknown as Attachment;
    const homeKey = attachmentQueryKeys.list.home(row.organizationId);
    queryClient.setQueryData(homeKey, { items: [row], total: 1 });

    patchCollaborativeDescription('attachment', row, description);

    expect(queryClient.getQueryData<{ items: Attachment[] }>(homeKey)?.items[0]).toMatchObject({ description, keywords: serverKeywords });
  });

  it('owns keywords with the description, so the derived column follows its stamp', () => {
    expect(getYjsOwnedFields('attachment')).toEqual(['description', 'keywords']);
  });
});
