import { createFileRoute } from '@tanstack/react-router';
import { OAuthConsentPage } from '~/modules/auth/oauth-consent-page';
import { consentRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { appTitle } from '~/utils/app-title';

/** Where the authorization server sends a person to approve a client; lives under the sign-in framing. */
export const Route = createFileRoute('/_public/auth/consent')({
  validateSearch: consentRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authorize') }] }),
  component: OAuthConsentPage,
});
