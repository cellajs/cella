import i18next from 'i18next';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { i18n } from '~/lib/i18n';
import router from '~/lib/router';
import { useAlertStore } from '~/store/alert';
import { useUserStore } from '~/store/user';
import type { MeUser } from '~/types/common';

// Fallback messages for common errors
const fallbackMessages = (t: (typeof i18n)['t']) => ({
  400: t('common:error.bad_request_action'),
  401: t('common:error.unauthorized_action'),
  403: t('common:error.forbidden_action'),
  404: t('common:error.not_found'),
  429: t('common:error.too_many_requests'),
});

export const onError = (error: Error) => {
  if (error instanceof ApiError) {
    const statusCode = Number(error.status);
    // Abort if /me or /menu, it should fail silently
    if (error.path && ['/me', '/menu'].includes(error.path)) return;

    const fallback = fallbackMessages(i18n.t);

    // Translate, try most specific first
    const errorMessage =
      error.entityType && i18next.exists(`common:error.resource_${error.type}`)
        ? i18n.t(`error.resource_${error.type}`, { resource: i18n.t(error.entityType) })
        : error.type && i18next.exists(`common:error.${error.type}`)
          ? i18n.t(`common:error.${error.type}`)
          : fallback[statusCode as keyof typeof fallback];

    // Show toast
    if (error.severity === 'info') toast.info(errorMessage || error.message);
    else toast.error(errorMessage || error.message);

    // Set down alerts
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    else if (statusCode === 504) useAlertStore.getState().setDownAlert('offline');

    if (statusCode === 401) {
      // Redirect to sign-in page if the user is not authenticated (except for /me)
      const redirectOptions: { to: string; replace: boolean; search?: { redirect: string } } = { to: '/auth/sign-in', replace: true };

      // If the path is not /auth/*, save the current path as a redirect
      if (location.pathname?.length > 2 && !location.pathname.startsWith('/auth/')) {
        redirectOptions.search = { redirect: location.pathname };
      }

      useUserStore.setState({ user: null as unknown as MeUser });
      router.navigate(redirectOptions);
    }
  }
};

const onSuccess = () => {
  // Clear down alerts
  useAlertStore.getState().setDownAlert(null);
};

export const queryClientConfig = { onError, onSuccess };
