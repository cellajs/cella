import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeMasks, routeTree } from './routeTree';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { i18n } from '~/lib/i18n';

const defaultMessages = (t: (typeof i18n)['t']) => ({
  '400': t('common:error.bad_request_action'),
  '401': t('common:error.unauthorized_action'),
  '403': t('common:error.forbidden_action'),
  '404': t('common:error.resource_not_found'),
  '429': t('common:error.too_many_requests'),
});

const onError = (error: Error) => {
  if (error instanceof ApiError) {
    const messages = defaultMessages(i18n.t);
    toast.error(error.type ? i18n.t(`common:error.${error.type}`) : messages[error.status as keyof typeof messages] || error.message);
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
