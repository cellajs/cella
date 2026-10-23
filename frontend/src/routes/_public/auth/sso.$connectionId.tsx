import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { ssoEntryRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { SsoEntryPage } from '~/modules/auth/sso-entry-page';
import { pageHead } from '~/utils/app-title';

/** An institution's sign-in entry, by its connection id: the link an institution shares; lives under the sign-in framing. */
export const Route = createFileRoute('/_public/auth/sso/$connectionId')({
  validateSearch: ssoEntryRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:sign_in')),
  component: SsoEntryPage,
});
