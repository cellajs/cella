import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type CreatePasswordData, type CreatePasswordResponse, createPassword } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { RequestPasswordDialog } from '~/modules/auth/request-password-dialog';
import { useGetTokenData } from '~/modules/auth/use-token-check';
import ErrorNotice from '~/modules/common/error-notice';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({ password: z.string().min(8).max(100) });
type FormValues = z.infer<typeof formSchema>;

const CreatePasswordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const requestButtonRef = useRef(null);

  const { tokenId } = useParams({ from: '/publicLayout/authLayout/auth/create-password/$tokenId' });

  const { data, isLoading, error } = useGetTokenData('password-reset', tokenId);
  const isMobile = window.innerWidth < 640;

  // Reset password & sign in
  const {
    mutate: _createPassword,
    isPending,
    error: resetPasswordError,
  } = useMutation<CreatePasswordResponse, ApiError, CreatePasswordData['body'] & CreatePasswordData['path']>({
    mutationFn: ({ tokenId, password }) => createPassword({ path: { tokenId }, body: { password } }),
    onSuccess: ({ redirectPath }) => {
      toaster(t('common:success.password_reset'), 'success');
      navigate({ to: redirectPath ?? appConfig.defaultRedirectPath });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '' },
  });

  // Submit new password
  const onSubmit = ({ password }: FormValues) => _createPassword({ tokenId, password });

  if (isLoading) return <Spinner className="h-10 w-10" />;

  // If error, allow to request new password reset
  if (error || resetPasswordError)
    return (
      <ErrorNotice error={error || resetPasswordError} level={'public'}>
        <RequestPasswordDialog email={data?.email}>
          <Button ref={requestButtonRef} size="lg">
            {t('common:forgot_password')}
          </Button>
        </RequestPasswordDialog>
      </ErrorNotice>
    );

  if (!data?.email) return null;

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {t('common:reset_resource', { resource: t('common:password').toLowerCase() })} <br />{' '}
        {data.email && (
          <Button variant="ghost" disabled className="font-light mt-2 text-xl">
            {data.email}
          </Button>
        )}
      </h1>
      <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative">
                  <Input type="password" autoFocus={!isMobile} placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                  <Suspense>
                    <PasswordStrength password={form.getValues('password')} minLength={8} />
                  </Suspense>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton loading={isPending} className="w-full">
          {t('common:reset')}
          <ArrowRight size={16} className="ml-2" />
        </SubmitButton>
      </form>
    </Form>
  );
};

export default CreatePasswordPage;
