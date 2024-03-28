import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeMasks, routeTree } from './routeTree';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { i18n } from '~/lib/i18n';
import i18next from 'i18next';

// Fallback messages for common errors
const fallbackMessages = (t: (typeof i18n)['t']) => ({
  '400': t('common:error.bad_request_action'),
  '401': t('common:error.unauthorized_action'),
  '403': t('common:error.forbidden_action'),
  '404': t('common:error.not_found'),
  '429': t('common:error.too_many_requests'),
});

const onError = (error: Error) => {
  if (error instanceof ApiError) {
    const fallback = fallbackMessages(i18n.t);

    // Translate error message, try the most specific first
    const errorMessage = error.resourceType && i18next.exists(`common:error.resource_${error.type}`)
      ? i18n.t(`error.resource_${error.type}`, { resource: error.resourceType })
      : error.type && i18next.exists(`common:error.${error.type}`)
        ? i18n.t(`common:error.${error.type}`)
        : fallback[error.status as keyof typeof fallback];

    // Show error message
    toast.error(errorMessage || error.message);

    if (error.status === '401') {
      router.navigate({
        to: '/auth/sign-in',
        search: {
          redirect: location.pathname,
        },
      });
    }
  }
};

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError,
  }),
  queryCache: new QueryCache({
    onError,
  }),
});

// Set up a Router instance
const router = createRouter({
  routeTree,
  routeMasks,
  // notFoundRoute,
  defaultPreload: false,
  context: {
    queryClient,
  },
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
