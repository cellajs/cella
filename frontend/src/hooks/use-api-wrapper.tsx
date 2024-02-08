import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '~/api';

const defaultMessages = (t: ReturnType<typeof useTranslation>['t']) => ({
  '401': t('error.unauthorized_action'),
  '403': t('error.forbidden_action'),
  '404': t('error.resource_not_found'),
});

export const useApiWrapper = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { location } = useRouterState();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiWrapper = useCallback(
    async <T,>(func: () => Promise<T>, onSuccess?: (result: T) => void, onError?: (e: ApiError) => void, messages?: Record<string, string>) => {
      const preparedMessages = Object.assign(messages || {}, defaultMessages(t));

      setPending(true);

      try {
        const result = await func();
        onSuccess?.(result);
        return result;
      } catch (e) {
        setError(e as Error);

        if (e instanceof ApiError) {
          toast.error(preparedMessages[e.status] || e.message);

          onError?.(e);

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
      }
    },
    [],
  );

  return [apiWrapper, pending, error] as const;
};
