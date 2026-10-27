import type { ChannelEntityType, EntityActionType, EntityRole, EntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import { allActionsDenied } from './action-helpers.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import { getEntityPolicies, getPolicyPermissions } from './policy-matrix.ts';
import { isRowCondition } from './row-conditions.ts';
import type { CanState, PolicyMatrix } from './types.ts';

/**
 * Three-valued so row conditions reach the UI: `true` allowed, `false` denied, condition name
 * (`'own'`, `'home'`, `'home:own'`, `'home|own'`) allowed only on matching rows, resolved per row by the
 * frontend's `resolveCan`.
 */
type ActionStates = Record<EntityActionType, CanState>;

/** Keyed by the channel entity plus its descendant types. */
export type EntityCanMap = Partial<Record<EntityType, ActionStates>>;

/**
 * Denies every action when no policy matches. A home-scoped grant's cells become `'home'` (`1`) and
 * `'home:own'` (`'own'`), except `create`: it has no row and the frontend creates at the
 * membership's channel, the new row's home.
 */
const computeEntityPermissions = (
  policies: PolicyMatrix,
  entityType: EntityType,
  channelType: ChannelEntityType,
  role: EntityRole,
  homeScoped: boolean,
): ActionStates => {
  const permissions = getPolicyPermissions(getEntityPolicies(policies, entityType), channelType, role);
  if (!permissions) return allActionsDenied;

  return recordFromKeys(appConfig.entityActions, (action) => {
    const value = permissions[action];
    const scoped = homeScoped && action !== 'create';
    if (value === 1) return scoped ? 'home' : true;
    // The condition name is the cell value; the frontend resolves it per row via resolveCan.
    if (isRowCondition(value)) return scoped && value === 'own' ? 'home:own' : value;
    return false;
  });
};

/** What the map reads of a grant: a membership, or a service account's binding. */
export type CanGrant = { channelType: ChannelEntityType; role: EntityRole };

/**
 * What either of two grants allows. Rows homed here beside the actor's own rows is a superset of neither, hence
 * `'home|own'`; `'home:own'` is the subset of both. `'public'` never resolves on the frontend, so any other grant
 * replaces it.
 */
const eitherState = (a: CanState, b: CanState): CanState => {
  if (a === true || b === true) return true;
  if (a === false || a === 'public') return b === false ? a : b;
  if (b === false || b === 'public' || a === b || b === 'home:own') return a;
  if (a === 'home:own') return b;
  return 'home|own';
};

/**
 * The frontend permission map for a channel and its descendants, from the actor's grants on that channel and on the
 * channels above it: the cells of each grant, merged so a cell holds what any of them allows. Row conditions stay
 * unresolved; no grant on the chain yields an empty map. The engine's home scoping (engine/check.ts) applies:
 *
 * - A role outside `hierarchy.elevatedGrants` reaches only product rows homed at its own channel. On the map's own
 *   channel its product cells carry the `'home'` mark, unless the channel is the product's declared parent, where
 *   every row is homed already. On a channel above, it reaches no row the map is asked about and adds nothing.
 * - Channel cells are never scoped: a grant above counts as the engine counts it for a channel subject.
 * @param channelType - The type of the channel the map is for.
 * @param grants - The actor's grants on that channel and above it, or the one on the channel itself. A grant on a
 * type outside the chain is left out.
 */
export const computeCan = (
  channelType: ChannelEntityType,
  grants: CanGrant | readonly CanGrant[] | undefined | null,
  policies: PolicyMatrix,
  overrides?: HierarchyOverrides,
): EntityCanMap => {
  if (!grants) return {};

  const { hierarchy: h, orderedChannels } = resolveHierarchy(overrides);
  const chain: readonly string[] = orderedChannels(channelType);
  const onChain = (Array.isArray(grants) ? grants : [grants]).filter((grant: CanGrant) => chain.includes(grant.channelType));
  if (onChain.length === 0) return {};

  /** One grant's cells for an entity type of the map. */
  const statesOf = ({ channelType: grantChannel, role }: CanGrant, entityType: EntityType): ActionStates => {
    const cells = (homeScoped: boolean) => computeEntityPermissions(policies, entityType, grantChannel, role, homeScoped);
    if (!h.isProduct(entityType) || h.elevatedGrants.has(`${grantChannel}:${role}`)) return cells(false);
    if (grantChannel !== channelType) return allActionsDenied;
    return cells(h.getParent(entityType) !== grantChannel);
  };

  const map: EntityCanMap = {};
  for (const entityType of [channelType, ...h.getOrderedDescendants(channelType)] as EntityType[]) {
    const perGrant = onChain.map((grant: CanGrant) => statesOf(grant, entityType));
    map[entityType] = perGrant.reduce((merged, states) =>
      recordFromKeys(appConfig.entityActions, (action) => eitherState(merged[action], states[action])),
    );
  }

  return map;
};
