/**
 * Load-test task generator — uses backend mocks for type-safe records.
 * Runs in Node.js (data-setup), not in k6.
 */
import { mockTask } from '../../../backend/mocks/mock-task';
import type { InsertTaskModel } from '../../../backend/src/db/schema/tasks';
import { ORG_ID, TENANT_ID, TOTAL_PROJECTS, projectId, taskId, userId } from './ids';

/**
 * Generate a load-test task record by index.
 */
export const loadtestTask = (index: number): InsertTaskModel => ({
  ...mockTask(`task:loadtest:${index}`),
  id: taskId(index),
  tenantId: TENANT_ID,
  name: `Load Test Task ${index}`,
  description: '<p>Initial task description.</p>',
  keywords: '',
  summary: '',
  summaryLength: 0,
  expandable: false,
  variant: 1,
  status: 5,
  displayOrder: index + 1,
  labels: [],
  assignedTo: [],
  organizationId: ORG_ID,
  projectId: projectId(index % TOTAL_PROJECTS),
  createdBy: userId(index),
  checkboxCount: 0,
  checkedCount: 0,
});
