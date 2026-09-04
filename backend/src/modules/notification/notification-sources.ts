import { and, eq, getColumns, inArray, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType, TrackedEventType } from 'shared';
import { textFromDocument } from 'shared/blocknote';
import type { DbOrTx } from '#/db/db';
import type { mentionableColumns, productColumns } from '#/db/utils/product-columns';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import type { BackendModule, ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import { onBackendModuleRegister } from '#/lib/module';
import { registerMutationHandler } from '#/lib/mutation-bus';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';
import { deriveMentions } from './operations/derive-mentions';

/** A product table as `productColumns` and the opt-in `mentionableColumns` shape it. */
type ProductTable = AnyPgTable &
  Record<keyof Pick<ReturnType<typeof productColumns>, 'id' | 'name' | 'description' | 'deletedAt'>, PgColumn> &
  Partial<Record<keyof typeof mentionableColumns, PgColumn>>;

/** One registered source: the module's declaration plus the two facts settled at registration. */
export interface NotificationSource {
  entityType: ProductEntityType;
  declaration: ModuleNotifications;
  /** The declaration's value, else whether the product table carries the `mentions` column. */
  mentionable: boolean;
  /** The declaration's value, else `both` when the module registers a Yjs materializer, else `client`. */
  deriveFrom: NonNullable<ModuleNotifications['deriveFrom']>;
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
  const source = registeredSource(module, module.productEntity);
  sources.set(module.productEntity, source);

  // Mentions derive in the writing transaction, so the stored `mentions` column is server-owned.
  if (source.mentionable) {
    for (const action of ['created', 'updated'] as const) {
      registerMutationHandler(`${module.productEntity}.${action}` as TrackedEventType, (ctx, payload) =>
        deriveMentions(ctx, payload, source),
      );
    }
  }
});

function registeredSource(module: BackendModule, entityType: ProductEntityType): NotificationSource {
  const declaration = module.notifications === true ? {} : (module.notifications ?? {});
  return {
    entityType,
    declaration,
    mentionable: declaration.mentionable ?? productTable(entityType).mentions !== undefined,
    deriveFrom: declaration.deriveFrom ?? (module.yjsMaterializer ? 'both' : 'client'),
  };
}

export const getNotificationSource = (entityType: string): NotificationSource | undefined => sources.get(entityType);

export const getNotificationSourceTypes = (): string[] => [...sources.keys()];

// Subject reads: the declaration's function when the app gave one, else the product table.

/** Audience-bearing rows for the ids: live (non-deleted, published) rows without the body and search text. */
export async function loadSubjectRows(source: NotificationSource, tx: DbOrTx, ids: string[]) {
  if (source.declaration.loadRows) return source.declaration.loadRows(tx, ids);
  const table = productTable(source.entityType);
  const { description: _description, keywords: _keywords, ...columns } = getColumns(table);
  const rows = await tx.select(columns).from(table).where(liveRows(table, ids));
  // A product row satisfies NotificationSubjectRow; the generic table select is untyped.
  return rows as NotificationSubjectRow[];
}

/** Persists the server-derived mention set; false when neither the declaration nor the table can. */
export async function writeSubjectMentions(source: NotificationSource, tx: DbOrTx, id: string, mentions: string[]) {
  if (source.declaration.writeMentions) {
    await source.declaration.writeMentions(tx, id, mentions);
    return true;
  }
  const table = productTable(source.entityType);
  if (!table.mentions) return false;
  await tx.update(table).set({ mentions }).where(eq(table.id, id));
  return true;
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
export async function loadSubjectNames(source: NotificationSource, tx: DbOrTx, ids: string[]) {
  if (source.declaration.loadContextNames) return source.declaration.loadContextNames(tx, ids);
  const table = productTable(source.entityType);
  const rows = await tx.select({ id: table.id, name: table.name }).from(table).where(liveRows(table, ids));
  return new Map(rows.map((row) => [String(row.id), String(row.name ?? '')]));
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
