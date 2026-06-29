/**
 * Single source of truth for all load-test ID and email helpers.
 * Used by both data-setup (Node.js) and k6 scenarios (via esbuild).
 *
 * All entity IDs are valid UUIDs using the BENCH_UUID_PREFIX (00000000-0000-4000-)
 * so they can be inserted into uuid columns. Each entity type uses a distinct
 * variant byte to avoid collisions.
 */

import { BENCH_TENANT_ID, BENCH_UUID_PREFIX } from 'shared/bench-identity';

/** Builds a deterministic UUID: 00000000-0000-4000-{variant}-{index padded to 12 hex chars} */
const benchUuid = (variant: string, i: number) => `${BENCH_UUID_PREFIX}${variant}-${i.toString(16).padStart(12, '0')}`;

/**
 * Variant byte (UUID group-4) claimed per core entity — the single source shared
 * by the id helpers below and each seed's `idVariant` (which derives its cleanup
 * predicate), so an id and the rows it cleans up can never drift apart.
 *
 * cella core owns the `a*` band; forks must claim the `b*` band (see registry.ts)
 * so new core and fork entities never collide across upstream syncs.
 */
export const CORE_ID_VARIANTS = {
  user: 'a000',
  org: 'a001',
  email: 'a002',
  attachment: 'a005',
  membership: 'a006',
  session: 'a007',
} as const;

export const TENANT_ID = BENCH_TENANT_ID;
export const ORG_ID = benchUuid(CORE_ID_VARIANTS.org, 0);

export const userId = (i: number) => benchUuid(CORE_ID_VARIANTS.user, i);
export const userEmail = (i: number) => `xbench-user-${String(i).padStart(4, '0')}@xbench.local`;
export const emailId = (i: number) => benchUuid(CORE_ID_VARIANTS.email, i);
export const attachmentId = (i: number) => benchUuid(CORE_ID_VARIANTS.attachment, i);
export const membershipId = (i: number) => benchUuid(CORE_ID_VARIANTS.membership, i);
export const sessionId = (i: number) => benchUuid(CORE_ID_VARIANTS.session, i);
