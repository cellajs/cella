import { type CanHome, type CanState, resolveCan } from 'shared';
import { useUserStore } from '~/modules/user/user-store';

/** `createdBy` as it appears on frontend entities: a user object, a bare id, or absent. */
type CreatedBy = string | { id: string } | null | undefined;

/** Resolves one row's can state, `home` being a product row's placement; affordances with no row use `isUnconditionalCan`. */
export const useResolveCan = () => {
  const user = useUserStore((state) => state.user);
  return (state: CanState | undefined, createdBy?: CreatedBy, home?: CanHome): boolean =>
    resolveCan(state, typeof createdBy === 'string' ? createdBy : (createdBy?.id ?? null), user?.id, home);
};
