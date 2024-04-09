import i18next from 'i18next';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { i18n } from '~/lib/i18n';
import { useAlertsStore } from '~/store/alerts';
import router from './router';
import type { User } from '~/types';
import { useUserStore } from '~/store/user';

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
    // Abort if /me or /menu, it should fail silently
    if (error.path && ['/me', '/menu'].includes(error.path)) return;

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

    if (error.status === 401) {
      // Redirect to sign-in page if the user is not authenticated (except for /me)
      const redirectOptions: { to: string; replace: boolean; search?: { redirect: string } } = { to: '/auth/sign-in', replace: true };

      // If the path is not /auth/*, save the current path as a redirect
      if (location.pathname?.length > 2 && !location.pathname.startsWith('/auth/')) {
        redirectOptions.search = { redirect: location.pathname };
      }
      
      useUserStore.setState({ user: null as unknown as User });
      router.navigate(redirectOptions);
    }
  }
};

const onSuccess = () => {
  // Clear down alerts
  useAlertsStore.getState().setDownAlert(null);
};

export const queryClientConfig = { onError, onSuccess };
