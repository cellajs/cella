/**
 * Load-test project generator — uses backend mocks for type-safe records.
 * Runs in Node.js (data-setup), not in k6.
 */
import { mockProject } from '../../../backend/mocks/mock-project';
import type { InsertProjectModel } from '../../../backend/src/db/schema/projects';
import { ORG_ID, TENANT_ID, projectId } from './ids';

/**
 * Generate a load-test project record by index.
 */
export const loadtestProject = (index: number): InsertProjectModel => {
  const record = mockProject(`lt-${index}`);
  return {
    ...record,
    id: projectId(index),
    tenantId: TENANT_ID,
    name: `Load Test Project ${index}`,
    slug: `xbench-project-${index}`,
    organizationId: ORG_ID,
    publicAt: null,
  };
};
