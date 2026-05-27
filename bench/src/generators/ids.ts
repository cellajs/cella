/**
 * Single source of truth for all load-test ID and email helpers.
 * Used by both data-setup (Node.js) and k6 scenarios (via esbuild).
 *
 * All entity IDs are valid UUIDs using the LOADTEST_UUID_PREFIX (00000001-)
 * so they can be inserted into uuid columns. Each entity type uses a distinct
 * variant byte to avoid collisions.
 */

/** Builds a deterministic UUID: 00000000-0000-4000-{variant}-{index padded to 12 hex chars} */
const benchUuid = (variant: string, i: number) =>
  `00000000-0000-4000-${variant}-${i.toString(16).padStart(12, '0')}`;

export const TENANT_ID = 'xbench';
export const ORG_ID = benchUuid('a001', 0);

export const userId = (i: number) => benchUuid('a000', i);
export const userEmail = (i: number) => `xbench-user-${String(i).padStart(4, '0')}@xbench.local`;
export const emailId = (i: number) => benchUuid('a002', i);
export const projectId = (i: number) => benchUuid('a003', i);
export const taskId = (i: number) => benchUuid('a004', i);
export const attachmentId = (i: number) => benchUuid('a005', i);
export const membershipId = (i: number) => benchUuid('a006', i);
export const sessionId = (i: number) => benchUuid('a007', i);

export const PROJECT_IDS = Array.from({ length: 10 }, (_, i) => projectId(i));

export const TOTAL_USERS = 1200;
export const TOTAL_PROJECTS = 10;
export const TOTAL_TASKS = 500;
export const TOTAL_ATTACHMENTS = 500;
