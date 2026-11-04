import { hierarchy } from 'shared';
import { AppError } from '#/core/error';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/**
 * The account's organization role. Its create writes exactly one organization binding, and no route changes bindings.
 * @throws AppError 500 for an account without one, which only a direct database write makes.
 */
export function organizationRole({ bindings }: Pick<ServiceAccountModel, 'bindings'>) {
  const bound = bindings.find(({ channelType }) => channelType === 'organization')?.role;
  const role = hierarchy.getRoles('organization').find((declared) => declared === bound);
  if (!role) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'service_account_without_organization_role' } });
  return role;
}
