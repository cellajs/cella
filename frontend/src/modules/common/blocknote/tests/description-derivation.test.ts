import { afterEach, describe, expect, it } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { registerDescriptionDerivation } = await import('~/modules/common/blocknote/description-derivation');
const { patchCollaborativeDescription } = await import('~/modules/common/blocknote/use-description-update');

type Row = { id: string; organizationId: string; description: string | null; keywords: string; name: string };

const keys = createEntityKeys('attachment');
registerEntityQueryKeys('attachment', keys);

const row: Row = { id: 'att-1', organizationId: 'org-1', description: 'before', keywords: 'before', name: 'Photo' };
const detailKey = keys.detail.byId(row.id);
const homeKey = keys.list.home(row.organizationId);

const seed = () => {
  queryClient.setQueryData(detailKey, row);
  queryClient.setQueryData(homeKey, { items: [row], total: 1 });
};
const detail = () => queryClient.getQueryData<Row>(detailKey);
const homeRow = () => queryClient.getQueryData<{ items: Row[] }>(homeKey)?.items[0];

afterEach(() => {
  queryClient.clear();
});

describe('registerDescriptionDerivation', () => {
  it('merges the derived fields into every collaborative patch, detail and lists alike', () => {
    registerDescriptionDerivation('attachment', (description) => ({ keywords: `derived ${description}` }));
    seed();

    patchCollaborativeDescription('attachment', row, 'after');

    for (const patched of [detail(), homeRow()]) expect(patched).toMatchObject({ description: 'after', keywords: 'derived after', name: 'Photo' });
  });
});
