import { type ActionPermissionState, resolvePermission } from 'shared';
import { useUserStore } from '~/modules/user/user-store';

/** `createdBy` as it appears on frontend entities: a user object, a bare id, or absent. */
type CreatedBy = string | { id: string } | null | undefined;

/**
 * The canonical way to collapse a three-state `can` value (`true | false | 'own'`) to a boolean
 * for a SPECIFIC entity.
 *
 * Prefer this over hand-rolled `=== true` / `!!` / `?? false`: those silently disagree on `'own'`
 * (`=== true` denies an owner who can edit; `!!` / `?? false` treat the `'own'` string as allowed
 * for everyone). For `'own'`, this checks the entity's creator against the current user.
 *
 * For a context-scoped affordance that can't resolve per-row ownership up front (e.g. deciding
 * whether to offer collaborative editing on an entity type), use `isUnconditionalPermission` from
 * `shared`. It enables only on an unconditional grant, never on `'own'`.
 */
export const useResolveCan = () => {
  const { user } = useUserStore();
  return (state: ActionPermissionState | undefined, createdBy?: CreatedBy): boolean =>
    resolvePermission(state, typeof createdBy === 'string' ? createdBy : (createdBy?.id ?? null), user?.id);
};
