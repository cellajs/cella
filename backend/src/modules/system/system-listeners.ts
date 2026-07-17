import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { type ActivityEvent, activityBus, getEventData } from '#/lib/activity-bus';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { findUserById } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';

const securityEmailType = {
  create: 'system-role-granted',
  update: 'system-role-changed',
  delete: 'system-role-revoked',
} as const;

/** Notify the security contact for every CDC-observed system-role change. */
const notifySystemRoleChange = async (event: ActivityEvent) => {
  const systemRole = getEventData(event, 'system_role');
  if (!systemRole) return;

  try {
    // On delete the user may already be cascade-deleted; fall back to the raw id
    const user = await findUserById({ var: { db: baseDb } }, { id: systemRole.userId });

    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, securityEmailType[event.action], {
      role: systemRole.role,
      userEmail: user?.email ?? systemRole.userId,
      timestamp: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    });
  } catch (error) {
    log.error('Failed to send system role security email', { error, activityId: event.id });
  }
};

activityBus.on('system_role.created', notifySystemRoleChange);
activityBus.on('system_role.updated', notifySystemRoleChange);
activityBus.on('system_role.deleted', notifySystemRoleChange);
