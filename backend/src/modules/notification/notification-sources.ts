import { and, getColumns, inArray, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { textFromDocument } from 'shared/blocknote';
import type { DbOrTx } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import type { productColumns } from '#/db/utils/product-columns';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import { onBackendModuleRegister } from '#/lib/module';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

/** A product table as `productColumns` shapes it. */
type ProductTable = AnyPgTable & Record<keyof Pick<ReturnType<typeof productColumns>, 'id' | 'name' | 'description' | 'deletedAt'>, PgColumn>;

/** One registered source: the product it covers and the module's declaration. */
export interface NotificationSource {
  entityType: ProductEntityType;
  declaration: ModuleNotifications;
}

/**
 * Sources keyed by product entity type, filled through `onBackendModuleRegister` (which replays
 * modules registered before this file loaded, so import order does not matter). Empty when no
 * module declares a source: the machinery is then dormant.
 */
const sources = new Map<string, NotificationSource>();

onBackendModuleRegister((module) => {
  if (!module.notifications) return;
  if (!module.productEntity) {
    log.error('Module declares notifications without productEntity; declaration ignored', { module: module.name });
    return;
  }
  const declaration = module.notifications === true ? {} : module.notifications;
  sources.set(module.productEntity, { entityType: module.productEntity, declaration });
});

export const getNotificationSource = (entityType: string): NotificationSource | undefined => sources.get(entityType);

// Subject reads: the declaration's function when the app gave one, else the product table.

/**
 * Audience-bearing rows for the ids: live (non-deleted, published) rows without the search text,
 * and without the body unless `body` asks for it (the fan-out reads mentions from it).
 */
export async function loadSubjectRows(source: NotificationSource, tx: DbOrTx, ids: string[], { body = false } = {}) {
  if (source.declaration.loadRows) return source.declaration.loadRows(tx, ids);
  const table = productTable(source.entityType);
  const { description, keywords: _keywords, ...columns } = getColumns(table);
  const rows = await tx
    .select(body ? { ...columns, description } : columns)
    .from(table)
    .where(liveRows(table, ids));
  // A product row satisfies NotificationSubjectRow; the generic table select is untyped.
  return rows as NotificationSubjectRow[];
}

/** Title and plain-text body for the instant email; null for a row that is gone. */
export async function loadSubjectPreview(source: NotificationSource, tx: DbOrTx, subjectId: string) {
  if (source.declaration.loadPreview) return source.declaration.loadPreview(tx, subjectId);
  const table = productTable(source.entityType);
  const [row] = await tx
    .select({ name: table.name, description: table.description })
    .from(table)
    .where(liveRows(table, [subjectId]))
    .limit(1);
  return row ? { title: String(row.name ?? ''), body: descriptionText(row.description) } : null;
}

/** Display names for context ids in digest lines. */
async function loadSubjectNames(source: NotificationSource, tx: DbOrTx, ids: string[]) {
  if (source.declaration.loadContextNames) return source.declaration.loadContextNames(tx, ids);
  const table = productTable(source.entityType);
  const rows = await tx.select({ id: table.id, name: table.name }).from(table).where(liveRows(table, ids));
  return new Map(rows.map((row) => [String(row.id), String(row.name ?? '')]));
}

// Across tenants: product rows are read under a tenant transaction, since on a bare connection the fail-closed RLS
// policy returns nothing. One round trip per tenant and source type, normally one in total.

interface SubjectRef {
  tenantId: string;
  entityType: string;
  /** The subject or context id; a ref without one is skipped. */
  id: string | null;
}

/** Display names for subject rows, keyed by id. */
export async function findSubjectNames(refs: SubjectRef[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const { tenantId, entityType, ids } of groupByTenantAndType(refs)) {
    const source = getNotificationSource(entityType);
    if (!source) continue;
    const found = await tenantReadById(tenantId, (tx) => loadSubjectNames(source, tx, ids));
    for (const [id, name] of found) names.set(id, name);
  }
  return names;
}

/** The refs' ids per tenant and entity type: one tenant transaction and source read each. */
export function groupByTenantAndType(refs: SubjectRef[]) {
  const groups = new Map<string, { tenantId: string; entityType: string; ids: Set<string> }>();
  for (const { tenantId, entityType, id } of refs) {
    if (!id) continue;
    const key = `${tenantId}:${entityType}`;
    const group = groups.get(key) ?? { tenantId, entityType, ids: new Set<string>() };
    group.ids.add(id);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, ids: [...group.ids] }));
}

// Hoisted: the registration listener above runs at import time. Product tables all carry
// productColumns; the registry types them as a union of concrete tables.
function productTable(entityType: ProductEntityType): ProductTable {
  return getEntityTable(entityType) as ProductTable;
}

function liveRows(table: ProductTable, ids: string[]): SQL | undefined {
  return and(inArray(table.id, ids), isNull(table.deletedAt), publishedRowsPredicate(table));
}

/** Plain text of a stored body for email excerpts: block documents flatten, legacy HTML passes through. */
function descriptionText(description: unknown): string {
  if (typeof description !== 'string') return '';
  return textFromDocument(description) ?? description;
}
