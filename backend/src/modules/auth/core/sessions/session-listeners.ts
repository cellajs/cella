import { activityBus, getEventData } from '#/lib/activity-bus';
import { dropCachedSessions } from '#/middlewares/guard/session-cache';

/**
 * CDC reports every committed change to users, memberships and system roles, whoever wrote it: each drops the user's
 * cached sessions in the API process, so the next request reads the user row, role and bindings version again.
 */
for (const verb of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`user.${verb}`, (event) => {
    const user = getEventData(event, 'user');
    if (user?.id) dropCachedSessions(user.id);
  });
  activityBus.on(`membership.${verb}`, (event) => {
    const membership = getEventData(event, 'membership');
    if (membership?.userId) dropCachedSessions(membership.userId);
  });
  activityBus.on(`system_role.${verb}`, (event) => {
    const systemRole = getEventData(event, 'system_role');
    if (systemRole?.userId) dropCachedSessions(systemRole.userId);
  });
}
