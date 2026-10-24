import { createFileRoute, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { MfaPage } from '~/modules/auth/mfa-page';
import { pendingMfaQueryOptions } from '~/modules/auth/query';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/mfa')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:authentication')),
  // The second factor completes the challenge a sign-in left in this browser's cookie; without one there is nothing to complete.
  beforeLoad: async () => {
    await queryClient.query({ ...pendingMfaQueryOptions, staleTime: 0 }).catch(() => {
      throw redirect({ to: '/auth/authenticate', replace: true });
    });
  },
  component: MfaPage,
});
