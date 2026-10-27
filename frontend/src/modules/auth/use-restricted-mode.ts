import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '~/modules/auth/auth-store';
import { authHealthQueryOptions } from '~/modules/auth/query';

/** Whether the auth steps take the neutral form: this browser was not recognized for an address, or the server's health answer asks for it. */
export function useRestrictedMode() {
  const storeRestrictedMode = useAuthStore((state) => state.restrictedMode);
  // Cache-only: the authenticate page fetches the health answer
  const { data: healthData } = useQuery({ ...authHealthQueryOptions, enabled: false });
  return storeRestrictedMode || !!healthData?.restrictedMode;
}
