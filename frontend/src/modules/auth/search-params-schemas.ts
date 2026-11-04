import { z } from 'zod';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import { booleanSearchParam, errorSearchSchema } from '~/modules/common/search-params-schemas';

/** An unsafe redirect reads as absent. */
const redirectSearchSchema = z
  .string()
  .optional()
  .transform((redirect) => safeRedirectPath(redirect));

export const authenticateRouteSearchParamsSchema = z.object({
  tokenId: z.string().optional(),
  redirect: redirectSearchSchema,
  fromRoot: booleanSearchParam,
});

/** The page the institution's sign-in returns to. */
export const ssoEntryRouteSearchParamsSchema = z.object({ redirect: redirectSearchSchema });

export const authErrorRouteSearchParamsSchema = z.object({ tokenId: z.string().optional() }).extend(errorSearchSchema.shape);

/** The authorization server's interaction id, carried through sign-in and back. */
export const consentRouteSearchParamsSchema = z.object({ uid: z.string() });
