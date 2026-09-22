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

/** The authorization server's interaction id, carried through sign-in and back. */
export const consentRouteSearchParamsSchema = z.object({ uid: z.string() });
