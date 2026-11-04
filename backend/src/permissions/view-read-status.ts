import type { Access, ProductEntityType } from 'shared';
import type { ActorBinding } from '#/core/context';
import { hasNoReadScope, type ReadRules, resolveCollectionReadFilter } from '#/permissions/collection-scope';
import type { AppCatchupResponse } from '#/schemas/stream-schemas';

/** Catchup disclosure of an organization's frontier: `ok` proves full read coverage, `opaque` allows rows but no number, `forbidden` no route. */
export type ViewReadStatus = AppCatchupResponse['views'][number]['status'];

/** Whether the organization's frontier of `entityType` may be shown, on the same scope resolution as collection reads. */
export function resolveViewReadStatus(
  access: Access<ActorBinding>,
  entityType: ProductEntityType,
  organizationId: string,
  rules?: ReadRules,
): ViewReadStatus {
  const filter = resolveCollectionReadFilter(access, entityType, organizationId, undefined, rules);
  // Only an org-wide unconditional read proves the frontier: a grant below the organization or a row condition reads part of it.
  if (filter.orgWide) return 'ok';
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
