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
 * Job handlers should wrap execution in `runWithLogContext(buildWorkerContext(jobData), fn)`
 * (from #/utils/logger) so worker logs carry tenant/user/org ids like request logs do.
 *
 * TODO [#08]: as unknown as AuthContext
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
