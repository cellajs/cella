import type { AuthContext } from '#/core/context';
import { baseDb } from '#/db/db';

export interface AiJobData {
  subjectId: string;
  userId: string;
  organizationId: string;
  tenantId: string;
}

/**
 * Builds a synthetic AuthContext from job data so the worker can use
 * tenantContext()/tenantRead() and permission helpers.
 *
 * TODO: as unknown as AuthContext and not wired atm
 * Phase 5 will use this for Yjs peer mode and retry tasks.
 */
export function buildWorkerContext(jobData: AiJobData): AuthContext {
  return {
    var: {
      db: baseDb,
      userId: jobData.userId,
      organizationId: jobData.organizationId,
      tenantId: jobData.tenantId,
      isSystemAdmin: false,
      memberships: [],
    },
  } as unknown as AuthContext;
}
