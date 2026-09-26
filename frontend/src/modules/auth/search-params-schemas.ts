import { z } from 'zod';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';

export const authenticateRouteSearchParamsSchema = z.object({
  tokenId: z.string().optional(),
  /** An unsafe redirect reads as absent. */
  redirect: z
    .string()
    .optional()
    .transform((redirect) => safeRedirectPath(redirect)),
  fromRoot: z.boolean().optional(),
});

export const authErrorRouteSearchParamsSchema = z
  .object({ tokenId: z.string().optional() })
  .extend(errorSearchSchema.shape);

/** The authorization server's interaction id, carried through sign-in and back. */
export const consentRouteSearchParamsSchema = z.object({ uid: z.string() });
