import { createFileRoute } from '@tanstack/react-router';
import { ApiError } from '~/lib/api';
import { PublicLayout } from '~/modules/common/public-layout';
import { meQueryOptions } from '~/modules/me/query';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';

/**
 * This is the layout for all public routes, for users without authentication. Marketing, auth pages and more.
 */
export const Route = createFileRoute('/_public')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicLayout,
  beforeLoad: ({ location, cause }) => {
    if (cause !== 'enter' || location.pathname === '/sign-out') return;

    // Hydrate the current user in the background so public pages can show an
    // authenticated state when a session exists. This MUST NOT block rendering:
    // public pages (marketing, docs, about) have to paint immediately. Awaiting
    // /me here would gate first paint on the round-trip — and, when /me fails as
    // a network error, on the /health connectivity probe behind onError too.
    queryClient.ensureQueryData({ ...meQueryOptions() }).catch((error) => {
      // A 401 on /me is expected for unauthenticated visitors on public pages — ignore silently
      if (error instanceof ApiError && error.status === 401) return;

      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }
    });
  },
});
