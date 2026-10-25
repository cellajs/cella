import type { ActorRef } from 'sdk';
import { type CanHome, type CanState, resolveCan } from 'shared';
import { useUserStore } from '~/modules/user/user-store';

/** Resolves one row's can state, `home` being a product row's placement; affordances with no row use `isUnconditionalCan`. */
export const useResolveCan = () => {
  const user = useUserStore((state) => state.user);
  return (state: CanState | undefined, createdBy?: ActorRef | null, home?: CanHome): boolean =>
    resolveCan(state, createdBy?.id ?? null, user?.id, home);
};
