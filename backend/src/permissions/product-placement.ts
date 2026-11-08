import type { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import {
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type EntityHierarchy,
  type EntityIdColumns,
  type EntityType,
  entityIdColumnKey,
  type HierarchyOverrides,
  type HomeChannelType,
  type NullableAncestorType,
  type ProductEntityType,
  resolveHierarchy,
} from 'shared';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveChannelInScope } from '#/permissions/get-valid-channel';
import { validUuidSchema } from '#/schemas';
import type { EntityModel } from '#/tables';

/**
 * What a product row takes from its home: the ancestor id columns below the organization, typed like its table
 * columns (a strict ancestor is `string`, a nullable one `string | null`, none for a product that lives in the
 * organization), and the home channel's `public`, so the row reads as its channel does.
 */
export type ResolvedPlacement<T extends ProductEntityType> = EntityIdColumns<
  Exclude<HomeChannelType<T>, NullableAncestorType<T>> & EntityType,
  string
> &
  EntityIdColumns<Extract<HomeChannelType<T>, NullableAncestorType<T>> & EntityType, string | null> & { public: boolean };

/** The channel a product row lives in. */
export interface PlacementHome {
  type: ChannelEntityType;
  entity: EntityModel<ChannelEntityType>;
}

/** Where in a create-body item a placement rule is broken, relative to the item, and which rule. */
export interface PlacementIssue {
  path: (string | number)[];
  /** The error type a client branches on: `params: { type }` of the schema issue, the type of the thrown error. */
  type: 'ambiguous_placement' | 'home_required';
  message: string;
}

/** The channel types below the organization a row may live in, deepest first, and whether it may live in the organization itself. */
const homeLevels = (entityType: string, hierarchy: EntityHierarchy) => {
  const homes = resolveHierarchy({ hierarchy }).hierarchy.possibleHomeChannels(entityType);
  return { levels: homes.filter((type) => type !== 'organization'), organizationIsHome: homes.includes('organization') };
};

const hasId = (item: Record<string, unknown>, channelType: string) => {
  const id = item[entityIdColumnKey(channelType)];
  return typeof id === 'string' && id !== '';
};

/**
 * Create-body placement fields of a product, to spread into its create-item schema. A client names the channel a
 * row lives in by one id, its home, and the chain above that channel is read off the channel's own row. So there is
 * one field per channel type the hierarchy lets the product live in: required where that is the only place, optional
 * otherwise, with {@link validatePlacement} holding an item to one id. None for a product that lives in the
 * organization.
 */
export const placementFieldsSchema = (entityType: ProductEntityType, { hierarchy = appHierarchy }: HierarchyOverrides = {}) => {
  const { levels, organizationIsHome } = homeLevels(entityType, hierarchy);
  const onlyHome = levels.length === 1 && !organizationIsHome;
  return Object.fromEntries(levels.map((type) => [entityIdColumnKey(type), onlyHome ? validUuidSchema : validUuidSchema.optional()])) as Record<
    string,
    z.ZodType<string | undefined>
  >;
};

/**
 * Checks one create-body item: one home id at most, and one at least where the row cannot live in the organization
 * or the product asks for a channel (`requireChannel`). Call it per item from the create-many schema's `superRefine`
 * and report the issue under the item's index.
 */
export const validatePlacement = (
  entityType: ProductEntityType,
  item: Record<string, unknown>,
  { hierarchy = appHierarchy, requireChannel = false }: HierarchyOverrides & { requireChannel?: boolean } = {},
): PlacementIssue | null => {
  const { levels, organizationIsHome } = homeLevels(entityType, hierarchy);
  const provided = levels.filter((type) => hasId(item, type));

  if (provided.length > 1) {
    return { path: [entityIdColumnKey(provided[0])], type: 'ambiguous_placement', message: t('error:ambiguous_placement.text') };
  }
  if (provided.length === 0 && levels.length > 0 && (requireChannel || !organizationIsHome)) {
    return { path: [entityIdColumnKey(levels[0])], type: 'home_required', message: t('error:home_required.text') };
  }
  return null;
};

interface ResolvePlacementOptions extends HierarchyOverrides {
  /** Refuses a row without a home id where the hierarchy would let it live in the organization. */
  requireChannel?: boolean;
  /**
   * Looks the home channel up, the organization included. The default checks existence and request scope and no
   * permission, since the create check on the placed row decides whether the actor may write there, and holds the row
   * `forShare`, so a toggle of its `public` waits for this write or this write for the toggle; pass a lookup with a
   * read check for a product whose home must be readable.
   */
  resolveHome?: (ctx: OrgContext, id: string, type: ChannelEntityType) => Promise<EntityModel<ChannelEntityType>>;
}

const resolveHeldHome = (ctx: OrgContext, id: string, type: ChannelEntityType) => resolveChannelInScope(ctx, id, type, { forShare: true });

/**
 * What a row being created or moved takes from its home, and the channel it lives in: the home id of `input`,
 * resolved to a channel row, plus that row's own ancestor ids and its `public`. Nothing above the home comes from the
 * client. Every other ancestor column below the organization is null, and without an id the row lives in the
 * organization (`home` is null) where the hierarchy allows it, whose row is then looked up for its flag.
 *
 * Call it in the write's transaction, where the home row stays held until the commit, so the flag the row takes is the
 * one its channel has when it commits. A move resolves the new home the same way; run the create check on the row with
 * the new columns before writing them.
 * @throws AppError 400 `ambiguous_placement` or `home_required` for an input {@link validatePlacement} refuses, so the
 * columns hold what their type says without the schema check; 404 `not_found` for a home that does not exist in the request scope.
 */
export const resolvePlacement = async <T extends ProductEntityType>(
  ctx: OrgContext,
  entityType: T,
  input: Record<string, unknown>,
  { hierarchy = appHierarchy, requireChannel, resolveHome = resolveHeldHome }: ResolvePlacementOptions = {},
): Promise<{ columns: ResolvedPlacement<T>; home: PlacementHome | null }> => {
  const issue = validatePlacement(entityType, input, { hierarchy, requireChannel });
  if (issue) throw new AppError(400, issue.type, 'warn', { entityType, meta: { field: String(issue.path[0]) } });

  const ancestors = hierarchy.getOrderedAncestors(entityType).filter((type) => type !== 'organization');
  const stamped: Record<string, string | null> = Object.fromEntries(ancestors.map((type) => [entityIdColumnKey(type), null]));

  const homeType = homeLevels(entityType, hierarchy).levels.find((type) => hasId(input, type));
  const homeId = homeType ? (input[entityIdColumnKey(homeType)] as string) : ctx.var.organization.id;
  const entity = await resolveHome(ctx, homeId, homeType ?? 'organization');

  if (homeType) {
    const row: Record<string, unknown> = entity;
    stamped[entityIdColumnKey(homeType)] = entity.id;
    for (const ancestor of hierarchy.getOrderedAncestors(homeType)) {
      if (ancestor === 'organization') break;
      const id = row[entityIdColumnKey(ancestor)];
      stamped[entityIdColumnKey(ancestor)] = typeof id === 'string' ? id : null;
    }
  }
  // Cast: the columns are built per hierarchy level at runtime, which the mapped type cannot follow.
  const columns = { ...stamped, public: entity.public } as ResolvedPlacement<T>;
  return { columns, home: homeType ? { type: homeType, entity } : null };
};
