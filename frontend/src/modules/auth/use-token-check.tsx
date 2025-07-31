import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { appConfig } from 'config';
import { checkToken } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { TokenData } from '~/modules/auth/types';

type TokenType = (typeof appConfig.tokenTypes)[number];
/**
 *  Check token by ID
 *
 * @param type Type of the token (`"email_verification" | "password_reset" | "invitation"`)
 * @param id Token ID to check
 * @param enabled (Default true) Enable the query
 */
export const useTokenCheck = (type: TokenType, id?: string, enabled = true): UseQueryResult<TokenData | undefined, ApiError> => {
  return useQuery({
    queryKey: [],
    queryFn: async () => {
      if (!id) throw new Error('Token ID is required');
      return checkToken({ path: { id }, query: { type } });
    },
    enabled,
  });
};
