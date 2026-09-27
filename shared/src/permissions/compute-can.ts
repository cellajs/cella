import type { ChannelEntityType, EntityActionType, EntityRole, EntityType } from '../../types.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import { allActionsDenied } from './action-helpers.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import { getEntityPolicies, getPolicyPermissions } from './policy-matrix.ts';
import { isRowCondition } from './row-conditions.ts';
import type { CanState, PolicyMatrix } from './types.ts';

/**
 * Three-valued so row conditions reach the UI: `true` allowed, `false` denied, condition name
 * (`'own'`, `'home'`, `'home:own'`) allowed only on matching rows, resolved per row by the
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
function computeEntityPermissions(
  entityType: ChannelEntityType | EntityType,
  channelType: ChannelEntityType,
  role: EntityRole,
  policies: PolicyMatrix,
  entityActions: readonly EntityActionType[],
  homeScoped: boolean,
): ActionStates {
  const entityPolicies = getEntityPolicies(entityType, policies);
  const permissions = getPolicyPermissions(entityPolicies, channelType, role);

  if (!permissions) return allActionsDenied;

  return recordFromKeys(entityActions, (action) => {
    const value = permissions[action];
    const scoped = homeScoped && action !== 'create';
    if (value === 1) return scoped ? 'home' : true;
    // The condition name is the cell value; the frontend resolves it per row via resolveCan.
    if (isRowCondition(value)) return scoped && value === 'own' ? 'home:own' : value;
    return false;
  }) as ActionStates;
}

/**
 * The frontend permission map for a channel and its descendants, from one membership. Row
 * conditions stay unresolved; a missing membership yields an empty map. The engine's home scoping
 * (engine/check.ts) applies: a role outside `hierarchy.elevatedGrants` reaches only product rows
 * homed at its own channel, so its product cells carry the `'home'` mark, unless the channel is
 * the product's declared parent, where every row is homed already.
 */
export const computeCan = (
  channelType: ChannelEntityType,
  membership: { channelType: ChannelEntityType; role: EntityRole } | undefined | null,
  policies: PolicyMatrix,
  overrides?: HierarchyOverrides,
): EntityCanMap => {
  if (!membership) return {};

  const { hierarchy: h, entityActions } = resolveHierarchy(overrides);
  const { channelType: grantChannel, role } = membership;
  const elevated = h.elevatedGrants.has(`${grantChannel}:${role}`);
  const states = (entityType: EntityType, homeScoped: boolean): ActionStates =>
    computeEntityPermissions(entityType, grantChannel, role, policies, entityActions, homeScoped);

  const map: EntityCanMap = { [channelType]: states(channelType, false) };

  for (const descendant of h.getOrderedDescendants(channelType) as EntityType[]) {
    const homeScoped = !elevated && h.isProduct(descendant) && h.getParent(descendant) !== grantChannel;
    map[descendant] = states(descendant, homeScoped);
  }

  return map;
};
