import type { ContextEntityType, ProductEntityType } from 'config';

import { getContextUser } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import type { MembershipSummary } from '#/modules/memberships/helpers/select';
import permissionManager, { type PermittedAction } from '#/permissions/permissions-config';

export const checkPermission = (
  memberships: MembershipSummary[],
  action: PermittedAction,
  entity: EntityModel<ContextEntityType | ProductEntityType>,
) => {
  const user = getContextUser();
  const isSystemAdmin = user.role === 'admin';

  const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);

  return isAllowed || isSystemAdmin;
};
