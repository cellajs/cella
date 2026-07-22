import { type ActionPermissionState, resolvePermission } from 'shared';
import { useUserStore } from '~/modules/user/user-store';

/** `createdBy` as it appears on frontend entities: a user object, a bare id, or absent. */
type CreatedBy = string | { id: string } | null | undefined;

/**
 * Resolves `true | false | 'own'` for a specific entity and the current user.
 * Context-wide affordances without a row should use `isUnconditionalPermission` so ownership
 * grants are not treated as universal.
 */
export const useResolveCan = () => {
  const { user } = useUserStore();
  return (state: ActionPermissionState | undefined, createdBy?: CreatedBy): boolean =>
    resolvePermission(state, typeof createdBy === 'string' ? createdBy : (createdBy?.id ?? null), user?.id);
};
