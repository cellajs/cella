import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import { SsoEntryPage } from '~/modules/auth/sso-entry-page';
import { appTitle } from '~/utils/app-title';

const searchSchema = z.object({
  /** An unsafe redirect reads as absent. */
  redirect: z
    .string()
    .optional()
    .transform((redirect) => safeRedirectPath(redirect)),
});

/** An institution's sign-in entry, by its connection id: the link an institution shares; lives under the sign-in framing. */
export const Route = createFileRoute('/_public/auth/sso/$connectionId')({
  validateSearch: searchSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sign in') }] }),
  component: SsoEntryPage,
});
