import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { type GetTokenDataData, getTokenData } from 'sdk';
import type { ApiError } from '~/lib/api';
import type { TokenData } from '~/modules/auth/types';

export const useGetTokenData = (
  type: GetTokenDataData['path']['type'],
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
