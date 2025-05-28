import type { ContextEntityType, ProductEntityType } from 'config';
import type { Context } from 'hono';

import { type Env, getContextMemberships, getContextOrganization } from '#/lib/context';
import type { EntityModel } from '#/lib/entity';
import { type ErrorType, createError } from '#/lib/errors';
import { checkPermission } from '#/permissions/check-if-allowed';

/**
 * Checks if user has permission to create product or context entity.
 *
 * This is separate from read/update/delete checks, since the entity may not exist yet.
 *
 * @param ctx - Request context.
 * @param entity - Entity the user wants to create.
 * @returns Error object or `null` if no error occurred.
 */
export const canCreateEntity = <K extends Exclude<ContextEntityType, 'organization'> | ProductEntityType>(
  ctx: Context<Env>,
  entity: EntityModel<K>,
): ErrorType | null => {
  const memberships = getContextMemberships();
  const org = getContextOrganization();

  // Step 1: Permission check
  const isAllowed = checkPermission(memberships, 'create', entity);
  if (!isAllowed) return createError(ctx, 403, 'forbidden', 'warn', entity.entityType);

  // Step 2: Organization ownership check
  if (org && 'organizationId' in entity && entity.organizationId !== org.id) {
    return createError(ctx, 400, 'invalid_request', 'error', entity.entityType);
  }

  return null;
};
