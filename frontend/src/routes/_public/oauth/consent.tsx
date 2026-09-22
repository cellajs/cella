import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { OAuthConsentPage } from '~/modules/auth/oauth-consent-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/oauth/consent')({
  validateSearch: z.object({ uid: z.string() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authorize') }] }),
  component: OAuthConsentPage,
});
