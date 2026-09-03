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
import { deriveMentionsFor } from './operations/derive-mentions';

/** A product table as `productColumns` and the opt-in `mentionableColumns` shape it. */
type ProductTable = AnyPgTable &
  Record<keyof Pick<ReturnType<typeof productColumns>, 'id' | 'name' | 'description' | 'deletedAt'>, PgColumn> &
  Partial<Record<keyof typeof mentionableColumns, PgColumn>>;

/** A declaration completed with the table-derived defaults: the readers the fan-out, emails and digest call. */
export type NotificationSource = ModuleNotifications &
  Required<Pick<ModuleNotifications, 'loadRows' | 'loadPreview' | 'loadContextNames'>>;

/**
 * Index of notification sources keyed by product entity type, filled through
 * `onBackendModuleRegister` (which replays modules registered before this file loaded, so import
 * order does not matter). Empty when no module declares a source: the machinery is then dormant.
 */
const sources = new Map<string, NotificationSource>();

onBackendModuleRegister((module) => {
  if (!module.notifications) return;
  if (!module.productEntity) {
    log.error('Module declares notifications without productEntity; declaration ignored', { module: module.name });
    return;
  }
  const source = withTableDefaults(module, module.productEntity);
  sources.set(module.productEntity, source);

  // Mentions derive in the writing transaction, so the stored `mentions` column is server-owned.
  if (source.mentionable) {
    for (const action of ['created', 'updated'] as const) {
      registerMutationHandler(
        `${module.productEntity}.${action}` as TrackedEventType,
        deriveMentionsFor(module.productEntity, source),
      );
    }
  }
});

/** The declaration completed with the table-derived defaults `ModuleNotifications` documents. */
function withTableDefaults(module: BackendModule, entityType: ProductEntityType): NotificationSource {
  const overrides: ModuleNotifications = module.notifications === true ? {} : (module.notifications ?? {});
  // Product tables all carry productColumns; the registry types them as a union of concrete tables.
  const table = getEntityTable(entityType) as ProductTable;
  const mentionable = overrides.mentionable ?? table.mentions !== undefined;

  const liveRows = (ids: string[]): SQL | undefined =>
    and(inArray(table.id, ids), isNull(table.deletedAt), publishedRowsPredicate(table));

  // The fan-out needs ids, audience and permission columns; the body and search text are the bulk of a row.
  const { description: _description, keywords: _keywords, ...subjectColumns } = getColumns(table);

  return {
    mentionable,
    deriveFrom: overrides.deriveFrom ?? (module.yjsMaterializer ? 'both' : 'client'),
    loadRows: async (tx: DbOrTx, ids: string[]) =>
      // A product row satisfies NotificationSubjectRow; the generic table select is untyped.
      (await tx.select(subjectColumns).from(table).where(liveRows(ids))) as NotificationSubjectRow[],
    writeMentions:
      table.mentions === undefined
        ? undefined
        : async (tx: DbOrTx, id: string, mentions: string[]) => {
            await tx.update(table).set({ mentions }).where(eq(table.id, id));
          },
    loadPreview: async (tx: DbOrTx, subjectId: string) => {
      const [row] = await tx
        .select({ name: table.name, description: table.description })
        .from(table)
        .where(liveRows([subjectId]))
        .limit(1);
      return row ? { title: String(row.name ?? ''), body: descriptionText(row.description) } : null;
    },
    loadContextNames: async (tx: DbOrTx, ids: string[]) => {
      const rows = await tx.select({ id: table.id, name: table.name }).from(table).where(liveRows(ids));
      return new Map(rows.map((row) => [String(row.id), String(row.name ?? '')]));
    },
    ...overrides,
  };
}

/** Plain text of a stored body for email excerpts: block documents flatten, legacy HTML passes through. */
function descriptionText(description: unknown): string {
  if (typeof description !== 'string') return '';
  return textFromDocument(description) ?? description;
}

export const getNotificationSource = (entityType: string): NotificationSource | undefined => sources.get(entityType);

export const getNotificationSourceTypes = (): string[] => [...sources.keys()];
