import { type Access, isProduct, type ProductEntityType } from 'shared';
import { tenantReadById } from '#/db/tenant-context';
import { checkAccessBatch } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { getNotificationSource, loadSubjectRows } from '../notification-sources';

interface SubjectRef {
  tenantId: string;
  entityType: string;
  subjectId: string;
}

/**
 * The subjects among `refs` that `access` may read now: the row is live and the permission engine allows read. A
 * notification went only to readers, but access can end afterwards, so the inbox, the digest and the mention mail ask
 * again before they name a subject or its channel. One round trip per tenant and source type.
 */
export async function findReadableSubjectIds(access: Access, refs: SubjectRef[]): Promise<Set<string>> {
  const groups = new Map<string, { tenantId: string; entityType: ProductEntityType; ids: Set<string> }>();
  for (const { tenantId, entityType, subjectId } of refs) {
    if (!isProduct(entityType)) continue;
    const key = `${tenantId}:${entityType}`;
    const group = groups.get(key) ?? { tenantId, entityType, ids: new Set<string>() };
    group.ids.add(subjectId);
    groups.set(key, group);
  }

  const readable = new Set<string>();
  for (const { tenantId, entityType, ids } of groups.values()) {
    const source = getNotificationSource(entityType);
    if (!source) continue;
    const rows = await tenantReadById(tenantId, (tx) => loadSubjectRows(source, tx, [...ids]));
    const subjects = rows.map((row) => buildSubjectFromEntity(entityType, row));
    const { results } = checkAccessBatch(access, 'read', subjects);
    for (const [id, { allowed }] of results) if (allowed) readable.add(id);
  }
  return readable;
}
