import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '~/api';
import { useNavigationStore } from '~/store/navigation';

const defaultMessages = (t: ReturnType<typeof useTranslation>['t']) => ({
  '400': t('common:error.bad_request_action'),
  '401': t('common:error.unauthorized_action'),
  '403': t('common:error.forbidden_action'),
  '404': t('common:error.resource_not_found'),
  '429': t('common:error.too_many_requests'),
});

// This hook is used to wrap API calls and handle errors and pending state
export const useApiWrapper = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { location } = useRouterState();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { setLoading } = useNavigationStore();

  const apiWrapper = useCallback(
    async <T,>(func: () => Promise<T>, onSuccess?: (result: T) => void, onError?: (e: ApiError) => void, messages?: Record<string, string>) => {
      const preparedMessages = Object.assign(messages || {}, defaultMessages(t));

      setPending(true);
      setLoading(true);

      try {
        const result = await func();
        onSuccess?.(result);
        return result;
      } catch (e) {
        setError(e as Error);

        if (e instanceof ApiError) {
          if (onError) {
            onError(e);
          } else {
            toast.error(e.type ? t(`common:error.${e.type}`) : preparedMessages[e.status] || e.message);
          }

          if (e.status === '401') {
            navigate({
              to: '/auth/sign-in',
              search: {
                redirect: location.pathname,
              },
            });
          }
        }
      } finally {
        setPending(false);
        setLoading(false);
      }
    },
    [],
  );

  return [apiWrapper, pending, error] as const;
};
