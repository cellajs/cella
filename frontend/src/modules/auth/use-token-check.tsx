import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';
import { checkToken, type TokenType } from '~/modules/auth/api';
import type { TokenData } from '~/modules/auth/types';

/**
 *  Check token by ID
 *
 * @param type Type of the token (`"email_verification" | "password_reset" | "invitation"`)
 * @param tokenId Token ID to check
 * @param enabled (Default true) Enable the query
 */
export const useTokenCheck = (type: TokenType, tokenId?: string, enabled = true): UseQueryResult<TokenData | undefined, ApiError> => {
  return useQuery({
    queryKey: [],
    queryFn: async () => {
      if (!tokenId) throw new Error('Token ID is required');
      return checkToken({ id: tokenId, type });
    },
    enabled,
  });
};
