import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { emailPasswordBodySchema } from '#/modules/auth/schema';

import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useRef } from 'react';
import type { ApiError } from '~/lib/api';
import { signIn } from '~/modules/auth/api';
import { RequestPasswordDialog } from '~/modules/auth/request-password-dialog';
import { AuthenticateRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

const formSchema = emailPasswordBodySchema;
type FormValues = z.infer<typeof formSchema>;
interface Props {
  email: string;
  resetSteps: () => void;
  emailEnabled: boolean;
}

// Either simply sign in with password or sign in with token to also accept organization invitation
export const SignInForm = ({ email, resetSteps, emailEnabled }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);

  const { lastUser, clearUserStore } = useUserStore();
  const { redirect, token, tokenId } = useSearch({ from: AuthenticateRoute.id });

  const isMobile = window.innerWidth < 640;

  // Set up form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email, password: '' },
  });

  // Handle sign in
  const { mutate: _signIn, isPending } = useMutation({
    mutationFn: signIn,
    onSuccess: (emailVerified) => {
      if (!emailVerified) return navigate({ to: '/auth/email-verification', replace: true });

      const redirectPath = token && tokenId ? '/invitation/$token' : redirect?.startsWith('/') ? redirect : config.defaultRedirectPath;

      navigate({
        to: redirectPath,
        replace: true,
        ...(token && tokenId && { params: { token }, search: { tokenId } }),
      });
    },
    onError: (error: ApiError) => {
      if (error?.status === 404) return resetSteps();

      if (error.type !== 'invalid_password') return;
      if (!isMobile) passwordRef.current?.focus();
      form.reset(form.getValues());
    },
  });

  const onSubmit = (values: FormValues) => _signIn({ ...values });

  const resetAuth = () => {
    clearUserStore();
    resetSteps();
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {token ? t('common:invite_sign_in') : lastUser ? t('common:welcome_back') : t('common:sign_in_as')} <br />
        <Button variant="ghost" onClick={resetAuth} disabled={!!token} className="font-light mt-2 text-xl">
          {email}
          {!token && <ChevronDown size={16} className="ml-2" />}
        </Button>
      </h1>
      {emailEnabled && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4 mt-0!">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="hidden">
                <FormControl>
                  <Input {...field} disabled type="email" autoComplete="off" placeholder={t('common:email')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {enabledStrategies.includes('password') && (
            <>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  // Custom css due to html injection by browser extensions
                  <FormItem className="gap-0">
                    <FormControl>
                      <Input
                        type="password"
                        id="password-field"
                        autoFocus={!isMobile}
                        {...field}
                        ref={passwordRef}
                        autoComplete="current-password"
                        placeholder={t('common:password')}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </FormItem>
                )}
              />

              <SubmitButton loading={isPending} className="w-full">
                {t('common:sign_in')}
                <ArrowRight size={16} className="ml-2" />
              </SubmitButton>
              <RequestPasswordDialog email={email}>
                <Button variant="ghost" size="sm" className="w-full font-normal">
                  {t('common:forgot_password')}
                </Button>
              </RequestPasswordDialog>
            </>
          )}
        </form>
      )}
    </Form>
  );
};
