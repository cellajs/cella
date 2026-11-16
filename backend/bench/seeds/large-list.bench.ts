import { appConfig, hierarchy } from 'shared';
import { LIST } from '../config';
import { registerBenchSeed } from '../registry';
import { insertSeedRows } from '../seed-utils';
import { loadtestAttachment } from './attachment.bench';
import { LARGE_LIST_ORG_ID, LARGE_LIST_TENANT_ID, largeListAttachmentId, largeListSeeded } from './ids';
import { loadtestOrgMembership } from './membership';
import { loadtestOrganization } from './organization';
import { upsertBenchTenant } from './tenant.bench';
import { LARGE_LIST_READER } from './user-constants';

/**
 * A second tenant and organization with `LIST.rows` attachments and one member, the reader of `full-list-read`. The
 * first organization keeps the size the other scenarios measure. The organization and attachments fall in the bands the
 * core seeds clean up. Where an attachment needs a channel below the organization, the list stays empty.
 */
registerBenchSeed({
  kind: 'custom',
  name: 'large-list',
  order: 110,
  cleanup: async ({ client }) => {
    await client.query('DELETE FROM memberships WHERE tenant_id = $1', [LARGE_LIST_TENANT_ID]);
    await client.query('DELETE FROM tenants WHERE id = $1', [LARGE_LIST_TENANT_ID]);
  },
  async seed({ pool, now }) {
    const tenantId = LARGE_LIST_TENANT_ID;
    await upsertBenchTenant(pool, tenantId, 'Load Test Large List', now);
    const organization = {
      ...loadtestOrganization(),
      id: LARGE_LIST_ORG_ID,
      tenantId,
      name: 'Load Test Large List',
      slug: 'xbench-large-list',
      createdAt: now,
    };
    await insertSeedRows(pool, { table: 'organizations', order: 40, rows: () => [] }, [organization]);
    const membership = {
      ...loadtestOrgMembership(LARGE_LIST_READER),
      tenantId,
      organizationId: LARGE_LIST_ORG_ID,
      channelId: LARGE_LIST_ORG_ID,
      createdAt: now,
    };
    await insertSeedRows(pool, { table: 'memberships', order: 50, rows: () => [] }, [membership]);
    if (!largeListSeeded) return;
    const attachments = Array.from({ length: LIST.rows }, (_, i) => ({
      ...loadtestAttachment(i),
      id: largeListAttachmentId(i),
      tenantId,
      organizationId: LARGE_LIST_ORG_ID,
      // The app's home names channels of the first organization: a nullable one stays empty here.
      ...Object.fromEntries(hierarchy.getNullableAncestors('attachment').map((type) => [appConfig.entityIdColumnKeys[type], null])),
      createdAt: now,
      seq: 0,
    }));
    await insertSeedRows(pool, { table: 'attachments', order: 100, rows: () => [] }, attachments);
  },
});
