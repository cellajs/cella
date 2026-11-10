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
  /** Opens the waitlist form; ignored unless sign-up is closed and the waitlist open. */
  waitlist: booleanSearchParam,
});

/** The page the institution's sign-in returns to. */
export const ssoEntryRouteSearchParamsSchema = z.object({ redirect: redirectSearchSchema });

export const authErrorRouteSearchParamsSchema = z.object({ tokenId: z.string().optional() }).extend(errorSearchSchema.shape);

/** The authorization server's interaction id, carried through sign-in and back. */
export const consentRouteSearchParamsSchema = z.object({ uid: z.string() });

/** `force` skips the unsaved-work question: the account is gone, so nothing can save. `redirect` names the same-origin page to open once signed out; the about page without one. */
export const signOutRouteSearchParamsSchema = z.object({ force: booleanSearchParam, redirect: z.string().optional() });

/** `provider` names the OAuth provider whose callback sent the person to verify their address. */
export const emailVerificationRouteSearchParamsSchema = z.object({ provider: z.string().optional() });
