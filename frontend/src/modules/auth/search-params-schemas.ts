import { z } from 'zod';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';

/** Search params for the authenticate and MFA routes. */
export const authenticateRouteSearchParamsSchema = z.object({
  tokenId: z.string().optional(),
  redirect: z.string().optional(),
  fromRoot: z.boolean().optional(),
});

/** Search params for the auth error route. */
export const authErrorRouteSearchParamsSchema = z
  .object({ tokenId: z.string().optional() })
  .extend(errorSearchSchema.shape);
