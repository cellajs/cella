import { type CanState, resolveCan } from 'shared';
import { useUserStore } from '~/modules/user/user-store';

/** `createdBy` as it appears on frontend entities: a user object, a bare id, or absent. */
type CreatedBy = string | { id: string } | null | undefined;

/**
 * Resolves `true | false | 'own'` for a specific entity and the current user.
 * Context-wide affordances without a row should use `isUnconditionalCan` so ownership
 * grants are not treated as universal.
 */
export const useResolveCan = () => {
  const { user } = useUserStore();
  return (state: CanState | undefined, createdBy?: CreatedBy): boolean =>
    resolveCan(state, typeof createdBy === 'string' ? createdBy : (createdBy?.id ?? null), user?.id);
};
