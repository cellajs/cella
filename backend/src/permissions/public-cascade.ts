import { and, count, eq, getColumns, isNull, ne } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import {
  type ChannelEntityType,
  publicReadGrants as configuredPublicReadGrants,
  type EntityHierarchy,
  entityIdColumnKey,
  type ProductEntityType,
  type PublicReadGrants,
  resolveHierarchy,
} from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { createServerStx } from '#/core/stx/create-server-stx';
import { baseDb } from '#/db/db';
import { stxWithIds } from '#/db/utils/stx-ids';
import type { BackendModule } from '#/lib/module';
import type { MutationHandler } from '#/lib/mutation-bus';
import { getEntityTable } from '#/tables';

/**
 * Rows one channel toggle may rewrite. The CDC worker holds a source transaction whole and stops past 100,000 changes
 * (its `maxTransactionEvents`), for every tenant; half of that leaves room for the channel's own change and for the
 * write the handler joined.
 */
const maxPublicCascadeRows = 50_000;

/** The rules a cascade resolves under, each the app's unless a test passes a synthetic one. */
export interface PublicCascadeRules {
  publicGrants?: PublicReadGrants;
  hierarchy?: EntityHierarchy;
  /** Rows one toggle may rewrite before it is refused. */
  maxRows?: number;
}

/** The fields of a channel row the cascade reads. */
interface ChannelPublicRow {
  id: string;
  tenantId: string;
  /** Absent on the organization's own row. */
  organizationId?: string;
  public: boolean;
}

interface CascadeChannelPublicOpts {
  channelType: ChannelEntityType;
  /** The product types with a public read grant that may home at `channelType`. */
  productTypes: ProductEntityType[];
  /** The channel rows before the write, index-aligned with `after`. */
  before: ChannelPublicRow[];
  after: ChannelPublicRow[];
  hierarchy: EntityHierarchy;
  maxRows: number;
}

/**
 * For each channel whose `public` the write changed, sets the flag of the `productTypes` rows homed there to the new
 * value, soft-deleted rows included. The stx takes the server's ids, or the tab that last edited a row would take the
 * change for its own echo; no edit stamps, since the publicity change is the channel's edit. The scope is the channel
 * row's own tenant and organization, so the handler needs no request scope.
 * @throws AppError 409 `channel_too_large` when the rows to rewrite exceed `maxRows`; an Error outside a transaction,
 *   since the rows must commit or roll back with the channel's write.
 */
async function cascadeChannelPublic(ctx: DbContext, { channelType, productTypes, before, after, hierarchy, maxRows }: CascadeChannelPublicOpts) {
  const changed = after.filter((channel, index) => before[index]?.public !== channel.public);
  if (changed.length === 0) return;
  if (ctx.var.db === baseDb) throw new Error('cascadeChannelPublic: needs the transaction of the channel write it follows');

  const targets = productTypes.map((productType) => {
    const table = getEntityTable(productType);
    const columns: Record<string, PgColumn | undefined> = getColumns(table);
    const columnOf = (type: string) => {
      const column = columns[entityIdColumnKey(type)];
      if (!column) throw new Error(`cascadeChannelPublic: ${productType} table carries no ${type} id column`);
      return column;
    };
    const ancestors = hierarchy.getOrderedAncestors(productType);
    const depth = ancestors.indexOf(channelType);
    if (depth === -1) throw new Error(`cascadeChannelPublic: ${channelType} is no ancestor of ${productType}`);
    // A row homes at its deepest non-null ancestor, so one holding a deeper ancestor id follows that channel.
    return { table, homeColumn: columnOf(channelType), deeperColumns: ancestors.slice(0, depth).map(columnOf) };
  });

  const { mutationId, sourceId } = createServerStx();
  for (const channel of changed) {
    const rowsOf = ({ table, homeColumn, deeperColumns }: (typeof targets)[number]) =>
      and(
        eq(table.tenantId, channel.tenantId),
        eq(table.organizationId, channel.organizationId ?? channel.id),
        eq(homeColumn, channel.id),
        ...deeperColumns.map((column) => isNull(column)),
        ne(table.public, channel.public),
      );

    let rows = 0;
    for (const target of targets) {
      const [{ value }] = await ctx.var.db.select({ value: count() }).from(target.table).where(rowsOf(target));
      rows += value;
    }
    if (rows > maxRows) throw new AppError(409, 'channel_too_large', 'warn', { entityType: channelType, meta: { rows, maxRows } });

    for (const target of targets) {
      await ctx.var.db
        .update(target.table)
        .set({ public: channel.public, stx: stxWithIds(target.table.stx, { mutationId, sourceId }) })
        .where(rowsOf(target));
    }
  }
}

/**
 * The `onMutation` handlers that keep every product with a public read grant at its home channel's `public`: one on
 * `<channel>.updated` per channel type those products may home at, so an app that declares `publicRead()` registers
 * nothing. Each handler joins the channel write's transaction, which reads soft-deleted rows.
 */
export function publicCascadeHandlers(rules: PublicCascadeRules = {}): NonNullable<BackendModule['onMutation']> {
  const { publicGrants = configuredPublicReadGrants, maxRows = maxPublicCascadeRows } = rules;
  const { hierarchy } = resolveHierarchy(rules);

  const productsByChannel = new Map<ChannelEntityType, ProductEntityType[]>();
  for (const entityType of Object.keys(publicGrants)) {
    if (!hierarchy.isProduct(entityType)) continue;
    for (const channelType of hierarchy.possibleHomeChannels(entityType)) {
      productsByChannel.set(channelType, [...(productsByChannel.get(channelType) ?? []), entityType]);
    }
  }

  const onMutation: NonNullable<BackendModule['onMutation']> = {};
  for (const [channelType, productTypes] of productsByChannel) {
    const handler: MutationHandler<`${ChannelEntityType}.updated`> = (ctx, { before = [], after = [] }) =>
      cascadeChannelPublic(ctx, { channelType, productTypes, before, after, hierarchy, maxRows });
    onMutation[`${channelType}.updated` as const] = handler;
  }
  return onMutation;
}
