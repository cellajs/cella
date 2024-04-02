import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import i18next from 'i18next';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { i18n } from '~/lib/i18n';
import { routeMasks, routeTree } from './routeTree';
import { useAlertsStore } from '~/store/alerts';

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

    // Translate, try most specific first
    const errorMessage =
      error.resourceType && i18next.exists(`common:error.resource_${error.type}`)
        ? i18n.t(`error.resource_${error.type}`, { resource: error.resourceType })
        : error.type && i18next.exists(`common:error.${error.type}`)
          ? i18n.t(`common:error.${error.type}`)
          : fallback[error.status as keyof typeof fallback];

    // Show toast
    toast.error(errorMessage || error.message);

    // Set down alerts
    if (error.status === 503) useAlertsStore.getState().setDownAlert('maintenance');
    else if (error.status === 504) useAlertsStore.getState().setDownAlert('offline');

    // Redirect to sign-in page if the user is not authenticated
    if (error.status === 401) {
      router.navigate({
        to: '/auth/sign-in',
        search: {
          redirect: location.pathname,
        },
      });
    }
  }
};

const onSuccess = () => {
  // Clear down alerts
  useAlertsStore.getState().setDownAlert(null);
};

// Set up a QueryClient instance
// https://tanstack.com/query/latest/docs/reference/QueryClient
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({ onError, onSuccess }),
  queryCache: new QueryCache({ onError, onSuccess }),
});

// Set up a Router instance
// https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
const router = createRouter({
  routeTree,
  routeMasks,
  // notFoundRoute,
  defaultPreload: false,
  context: { queryClient },
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
