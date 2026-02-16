import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { TokenType } from 'shared';
import { getTokenData } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { TokenData } from '~/modules/auth/types';

/**
 *  Get token data by ID.
 *
 * @param type Type of the token
 * @param tokenId Token ID to check
 * @param enabled (Default true) Enable the query
 */
export const useGetTokenData = (
  type: TokenType,
  tokenId?: string,
  enabled = true,
): UseQueryResult<TokenData | undefined, ApiError> => {
  return useQuery({
    queryKey: [],
    queryFn: async () => {
      if (!tokenId) throw new Error('Token ID is required');
      return getTokenData({ path: { type, id: tokenId } });
    },
    enabled,
    staleTime: 0, // Important to always get latest token status
  });
};
