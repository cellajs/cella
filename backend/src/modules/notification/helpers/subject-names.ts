import { tenantReadById } from '#/db/tenant-context';
import { getNotificationSource, loadSubjectNames } from '../notification-sources';

interface SubjectRef {
  tenantId: string;
  entityType: string;
  /** The subject or context id to name. */
  id: string | null;
}

/**
 * Display names for subject rows, keyed by id. Names live in tenant-scoped product tables and
 * must be read under a tenant transaction: on a bare connection the fail-closed RLS policy
 * returns nothing. One round trip per tenant and source type, normally one in total.
 */
export async function findSubjectNames(refs: SubjectRef[]): Promise<Map<string, string>> {
  const idsByTenantAndType = new Map<string, { tenantId: string; entityType: string; ids: Set<string> }>();
  for (const ref of refs) {
    if (!ref.id) continue;
    const key = `${ref.tenantId}:${ref.entityType}`;
    const group = idsByTenantAndType.get(key) ?? { tenantId: ref.tenantId, entityType: ref.entityType, ids: new Set() };
    group.ids.add(ref.id);
    idsByTenantAndType.set(key, group);
  }

  const names = new Map<string, string>();
  for (const { tenantId, entityType, ids } of idsByTenantAndType.values()) {
    const source = getNotificationSource(entityType);
    if (!source) continue;
    const found = await tenantReadById(tenantId, (tx) => loadSubjectNames(source, tx, [...ids]));
    for (const [id, name] of found) names.set(id, name);
  }
  return names;
}
