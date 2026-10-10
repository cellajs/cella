import type { z } from '@hono/zod-openapi';
import {
  type AncestorChannelType,
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type EntityHierarchy,
  type EntityIdColumns,
  type EntityType,
  entityIdColumnKey,
  type NullableAncestorType,
  type ProductEntityType,
} from 'shared';
import type { OrgContext } from '#/core/context';
import { resolveChannelInScope } from '#/permissions/get-valid-channel';
import { validUuidSchema } from '#/schemas';
import type { EntityModel } from '#/tables';

type SubOrgAncestor<T extends ProductEntityType> = Exclude<AncestorChannelType<T>, 'organization'>;

/**
 * The ancestor id columns of a product row below the organization, typed like its table columns: a strict ancestor
 * is `string`, a nullable one `string | null`. Empty for a product that lives in the organization.
 */
export type ResolvedPlacement<T extends ProductEntityType> = EntityIdColumns<
  Exclude<SubOrgAncestor<T>, NullableAncestorType<T>> & EntityType,
  string
> &
  EntityIdColumns<Extract<SubOrgAncestor<T>, NullableAncestorType<T>> & EntityType, string | null>;

/** The channel a product row lives in. */
export interface PlacementHome {
  type: ChannelEntityType;
  entity: EntityModel<ChannelEntityType>;
}

/** Where in a create-body item a placement rule is broken, relative to the item. */
export interface PlacementIssue {
  path: (string | number)[];
  message: string;
}

interface HierarchyOption {
  /** Another hierarchy than the app's, for tests on a synthetic one. */
  hierarchy?: EntityHierarchy;
}

/** The channel types below the organization a row may live in, deepest first, and whether it may live in the organization itself. */
const homeLevels = (entityType: string, hierarchy: EntityHierarchy) => {
  const homes = hierarchy.possibleHomeChannels(entityType);
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
export const placementFieldsSchema = (entityType: ProductEntityType, { hierarchy = appHierarchy }: HierarchyOption = {}) => {
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
  { hierarchy = appHierarchy, requireChannel = false }: HierarchyOption & { requireChannel?: boolean } = {},
): PlacementIssue | null => {
  const { levels, organizationIsHome } = homeLevels(entityType, hierarchy);
  const provided = levels.filter((type) => hasId(item, type));

  if (provided.length > 1) {
    return {
      path: [entityIdColumnKey(provided[0])],
      message: 'Ambiguous placement: send only the deepest home id (its ancestors are derived server-side)',
    };
  }
  if (provided.length === 0 && levels.length > 0 && (requireChannel || !organizationIsHome)) {
    return { path: [entityIdColumnKey(levels[0])], message: 'Missing placement: send the id of the channel the row lives in' };
  }
  return null;
};

interface ResolvePlacementOptions extends HierarchyOption {
  /**
   * Looks the home channel up. The default checks existence and request scope and no permission, since the create
   * check on the placed row decides whether the actor may write there; pass a lookup with a read check for a product
   * whose home must be readable.
   */
  resolveHome?: (ctx: OrgContext, id: string, type: ChannelEntityType) => Promise<EntityModel<ChannelEntityType>>;
}

/**
 * The ancestor columns of a row being created or moved, and the channel it lives in: the home id of `input`, resolved
 * to a channel row, plus that row's own ancestor ids. Nothing above the home comes from the client. Every other
 * ancestor column below the organization is null, and without an id the row lives in the organization (`home` is
 * null), which {@link validatePlacement} lets through only where the hierarchy allows it.
 *
 * A move resolves the new home the same way; run the create check on the row with the new columns before writing them.
 * @throws AppError 404 `not_found` for a home that does not exist in the request scope.
 */
export const resolvePlacement = async <T extends ProductEntityType>(
  ctx: OrgContext,
  entityType: T,
  input: Record<string, unknown>,
  { hierarchy = appHierarchy, resolveHome = resolveChannelInScope }: ResolvePlacementOptions = {},
): Promise<{ columns: ResolvedPlacement<T>; home: PlacementHome | null }> => {
  const ancestors = hierarchy.getOrderedAncestors(entityType).filter((type) => type !== 'organization');
  const stamped: Record<string, string | null> = Object.fromEntries(ancestors.map((type) => [entityIdColumnKey(type), null]));
  // Cast: the columns are built per hierarchy level at runtime, which the mapped type cannot follow.
  const columns = stamped as ResolvedPlacement<T>;

  const homeType = homeLevels(entityType, hierarchy).levels.find((type) => hasId(input, type)) as ChannelEntityType | undefined;
  if (!homeType) return { columns, home: null };

  const entity = await resolveHome(ctx, input[entityIdColumnKey(homeType)] as string, homeType);
  const row = entity as Record<string, unknown>;
  stamped[entityIdColumnKey(homeType)] = entity.id;
  for (const ancestor of hierarchy.getOrderedAncestors(homeType)) {
    if (ancestor === 'organization') break;
    const id = row[entityIdColumnKey(ancestor)];
    stamped[entityIdColumnKey(ancestor)] = typeof id === 'string' ? id : null;
  }
  return { columns, home: { type: homeType, entity } };
};
