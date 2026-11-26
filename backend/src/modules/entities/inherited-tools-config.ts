import { inArray, sql } from 'drizzle-orm';
import { hierarchy as appHierarchy, type ChannelEntityType, type EntityHierarchy, resolveHierarchy, toColumnName } from 'shared';
import { type ChannelSlot, storableSlots } from 'shared/placements';
import { type SlotToolsConfig, stackSlotConfigs, type ToolsConfig } from 'shared/tools-config';
import type { ActorContext, DbContext } from '#/core/context';
import { channelTables } from '#/db/channel-tables';

/** A channel row as its inherited layer reads it: its id, its ancestor id columns and its own arrangement. */
type ArrangedRow = { id: string; toolsConfig?: ToolsConfig } & Record<string, unknown>;

/** `orgGuard`'s organization, where it ran, saves reading the one ancestor every row of the request shares. */
type InheritedLayerContext = DbContext & { var: Pick<ActorContext['var'], 'organization'> };

/**
 * The ancestor ids the rows' inherited layers read and `known` lacks, per ancestor type, each id once however many rows
 * share it. A row without an id at a level skips that level.
 */
export function ancestorIdsToRead(
  entityType: string,
  rows: readonly ArrangedRow[],
  known: ReadonlyMap<string, ToolsConfig>,
  entityHierarchy: EntityHierarchy = appHierarchy,
): Map<ChannelEntityType, string[]> {
  const { hierarchy } = resolveHierarchy({ hierarchy: entityHierarchy });
  const toRead = new Map<ChannelEntityType, string[]>();
  for (const type of hierarchy.getOrderedAncestors(entityType)) {
    const ids = new Set<string>();
    for (const row of rows) {
      const id = row[hierarchy.idColumnKeys[type]];
      if (typeof id === 'string' && !known.has(id)) ids.add(id);
    }
    if (ids.size) toRead.set(type, [...ids]);
  }
  return toRead;
}

/**
 * One row's inherited layer: per slot the row may store, its ancestors' arrangements stacked organization first. Sparse:
 * a slot no ancestor arranges is absent, and so is an ancestor missing from `configs`.
 */
export function inheritedLayer(
  entityType: string,
  row: ArrangedRow,
  configs: ReadonlyMap<string, ToolsConfig>,
  entityHierarchy: EntityHierarchy = appHierarchy,
): ToolsConfig {
  const { hierarchy } = resolveHierarchy({ hierarchy: entityHierarchy });
  const ancestorConfigs = hierarchy
    .getOrderedAncestors(entityType)
    .toReversed()
    .map((type) => {
      const id = row[hierarchy.idColumnKeys[type]];
      return typeof id === 'string' ? configs.get(id) : undefined;
    });

  const layer: ToolsConfig = {};
  for (const slot of storableSlots(entityType, entityHierarchy)) {
    const stacked = stackSlotConfigs(...ancestorConfigs.map((config) => config?.[slot]));
    if (stacked) layer[slot] = stacked;
  }
  return layer;
}

/**
 * The inherited layer of each row of `entityType`, by row id: what the channels above it store for its slots, which a
 * response carries as `included.inheritedToolsConfig` since its reader may read none of those channels. It never holds
 * an ancestor's arrangement of the ancestor's own pages. One statement over the ancestor tables reads every ancestor
 * the rows name, and none runs when `orgGuard`'s organization is the only one.
 * @public
 */
export async function getInheritedToolsConfigs(
  ctx: InheritedLayerContext,
  entityType: ChannelEntityType,
  rows: readonly ArrangedRow[],
): Promise<Map<string, ToolsConfig>> {
  const known = new Map<string, ToolsConfig>();
  const { organization } = ctx.var;
  if (organization) known.set(organization.id, organization.toolsConfig);

  const toolsConfigColumn = sql.identifier(toColumnName('toolsConfig'));
  const selects = [...ancestorIdsToRead(entityType, rows, known)].map(([type, ids]) => {
    const table = channelTables[type]();
    return sql`SELECT ${table.id} AS id, ${toolsConfigColumn} AS "toolsConfig" FROM ${table} WHERE ${inArray(table.id, ids)}`;
  });
  if (selects.length) {
    const { rows: ancestors } = await ctx.var.db.execute<{ id: string; toolsConfig: ToolsConfig }>(sql.join(selects, sql` UNION ALL `));
    for (const { id, toolsConfig } of ancestors) known.set(id, toolsConfig);
  }

  return new Map(rows.map((row) => [row.id, inheritedLayer(entityType, row, known)]));
}

/**
 * A row's arrangement of `slot` with the layer the channels above it store under its own, for a server rule that reads
 * an arrangement, such as a create that a hidden tab refuses. The app's `surfaces` are not in it. Undefined when no
 * layer arranges the slot.
 * @public
 */
export async function getStackedSlotConfig(
  ctx: InheritedLayerContext,
  entityType: ChannelEntityType,
  row: ArrangedRow,
  slot: ChannelSlot,
): Promise<SlotToolsConfig | undefined> {
  const inherited = (await getInheritedToolsConfigs(ctx, entityType, [row])).get(row.id);
  return stackSlotConfigs(inherited?.[slot], row.toolsConfig?.[slot]);
}
