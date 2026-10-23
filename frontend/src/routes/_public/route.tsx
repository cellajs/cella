import { createFileRoute } from '@tanstack/react-router';
import { PublicLayout } from '~/modules/common/public-layout';
import { meQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

export const Route = createFileRoute('/_public')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicLayout,
  beforeLoad: ({ location, cause }) => {
    if (cause !== 'enter' || location.pathname === '/auth/sign-out') return;

    // Hydrate user state without blocking public-page paint on `/me` or connectivity probing; the query cache reports a failure.
    queryClient.query({ ...meQueryOptions(), staleTime: 'static' }).catch(() => {});
  },
});
