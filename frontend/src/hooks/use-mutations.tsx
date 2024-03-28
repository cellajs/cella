import { type UseMutationOptions, type UseMutationResult, useMutation as useBaseMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
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

export const useMutation = <TData = unknown, TError = ApiError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setLoading } = useNavigationStore();

  const data = useBaseMutation<TData, TError, TVariables, TContext>({
    ...options,
    onError: (err, variables, context) => {
      options.onError?.(err, variables, context);
      const messages = defaultMessages(t);
      if (err instanceof ApiError) {
        toast.error(err.type ? t(`common:error.${err.type}`) : messages[err.status as keyof typeof messages] || err.message);

        if (err.status === '401') {
          navigate({
            to: '/auth/sign-in',
            search: {
              redirect: location.pathname,
            },
          });
        }
      }
    },
  });

  useEffect(() => {
    setLoading(data.isPending);
  }, [data.isPending, setLoading]);

  return data;
};
