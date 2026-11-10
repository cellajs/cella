import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { MfaPage } from '~/modules/auth/mfa-page';
import { mfaBeforeLoad } from '~/modules/auth/route-logic';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/mfa')({
  validateSearch: authenticateRouteSearchParamsSchema,
  beforeLoad: mfaBeforeLoad,
  head: () => pageHead(i18n.t('c:authentication')),
  component: MfaPage,
});
