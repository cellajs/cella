import { z } from 'zod';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';

export const authenticateRouteSearchParamsSchema = z.object({
  tokenId: z.string().optional(),
  redirect: z.string().optional(),
  fromRoot: z.boolean().optional(),
});

export const authErrorRouteSearchParamsSchema = z
  .object({ tokenId: z.string().optional() })
  .extend(errorSearchSchema.shape);
