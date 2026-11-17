import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { LIST } from '../config';
import { LARGE_LIST_ORG_ID, LARGE_LIST_TENANT_ID, largeListAttachmentId, largeListSeeded } from '../seeds/ids';
import { LARGE_LIST_READER } from '../seeds/user-constants';
import { LIST_COUNTERS, LIST_HISTOGRAMS, runListRead } from '../sync/list-read';

/** `sync/list-read.ts` drives it on the large-list organization (`seeds/large-list.bench.ts`); `LIST_ROWS` and `LIST_READS` shape it. */
export default defineScenario({
  description: 'what a fresh client pays to read a whole large list, as fetchAllPages does',
  counters: LIST_COUNTERS,
  histograms: LIST_HISTOGRAMS,
  primary: 'sync.full_list_ms.p95',
  checks: { maxErrorShare: 0, forbid: ['sync.list_incomplete', 'bench.rows_diverged', 'sse.errors'] },
  run: (vu) => {
    if (!largeListSeeded) throw new Error('full-list-read needs attachments that may live in an organization with no channel below it');
    return runListRead(
      vu,
      attachmentProduct,
      {
        organizationId: LARGE_LIST_ORG_ID,
        organizationPath: `/tenants/${LARGE_LIST_TENANT_ID}/organizations/${LARGE_LIST_ORG_ID}`,
        ids: Array.from({ length: LIST.rows }, (_, i) => largeListAttachmentId(i)),
        readerUser: LARGE_LIST_READER,
      },
      LIST,
    );
  },
});
