import { BENCH_TENANT_ID, BENCH_UUID_PREFIX } from 'shared/utils/bench-identity';

/**
 * Single source of truth for load-test ID and email helpers, used by both
 * data-setup and the Artillery processors. Builds a deterministic UUID:
 * 00000000-0000-4000-{variant}-{index padded to 12 hex chars}. Each entity
 * type uses a distinct variant byte to avoid collisions.
 */
const benchUuid = (variant: string, i: number) => `${BENCH_UUID_PREFIX}${variant}-${i.toString(16).padStart(12, '0')}`;

/**
 * Variant byte (UUID group-4) claimed per core entity: the single source shared
 * by the id helpers below and each seed's `idVariant` (which derives its cleanup
 * WHERE clause), so an id and the rows it cleans up can never drift apart.
 *
 * cella core owns the `a*` band; forks must claim the `b*` band so new core and
 * fork entities never collide across upstream syncs.
 *
 * @see registry.ts
 */
export const CORE_ID_VARIANTS = {
  user: 'a000',
  org: 'a001',
  email: 'a002',
  attachment: 'a005',
  membership: 'a006',
  session: 'a007',
  task: 'b008',
  project: 'b009',
} as const;

export const TENANT_ID = BENCH_TENANT_ID;
export const ORG_ID = benchUuid(CORE_ID_VARIANTS.org, 0);

export const userId = (i: number) => benchUuid(CORE_ID_VARIANTS.user, i);
export const userEmail = (i: number) => `xbench-user-${String(i).padStart(4, '0')}@xbench.local`;
export const emailId = (i: number) => benchUuid(CORE_ID_VARIANTS.email, i);
export const attachmentId = (i: number) => benchUuid(CORE_ID_VARIANTS.attachment, i);
export const membershipId = (i: number) => benchUuid(CORE_ID_VARIANTS.membership, i);
export const sessionId = (i: number) => benchUuid(CORE_ID_VARIANTS.session, i);
export const taskId = (i: number) => benchUuid(CORE_ID_VARIANTS.task, i);
export const projectId = (i: number) => benchUuid(CORE_ID_VARIANTS.project, i);
