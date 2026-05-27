/**
 * Task Edit processor for Artillery.
 *
 * Builds task edit payloads (assignedTo, variant, status, description)
 * and sets context variables for the YAML scenario flow.
 */
import { TENANT_ID, ORG_ID, taskId } from '../config';
import { TOTAL_TASKS } from '../generators/ids';
import { allEditBuilders } from '../helpers/edits';

export { authenticate } from './auth';

let iterCount = 0;

export function buildTaskEditPayload(
  context: { vars: Record<string, unknown> },
  _events: unknown,
  done: () => void,
) {
  const userIndex = (context.vars.userIndex as number) ?? 0;
  const tId = taskId(userIndex % TOTAL_TASKS);

  context.vars.tenantId = TENANT_ID;
  context.vars.orgId = ORG_ID;
  context.vars.taskId = tId;
  context.vars.payload = allEditBuilders[iterCount++ % allEditBuilders.length]();
  done();
}
