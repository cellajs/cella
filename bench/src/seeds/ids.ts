import { BENCH_TENANT_ID, BENCH_UUID_PREFIX } from 'shared/utils/bench-identity';

/** Deterministic UUID 00000000-0000-4000-{variant}-{index padded to 12 hex chars}, shared by data-setup and the Artillery processors. */
const benchUuid = (variant: string, i: number) => `${BENCH_UUID_PREFIX}${variant}-${i.toString(16).padStart(12, '0')}`;

/**
 * One variant byte per core entity, shared by the id helpers and each seed's `idVariant`, so ids and the rows they clean up cannot drift apart. Cella core owns the `a*` band, apps the `b*` band.
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
