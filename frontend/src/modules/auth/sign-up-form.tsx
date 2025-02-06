import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { emailPasswordBodySchema } from '#/modules/auth/schema';

import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { signUp, signUpWithToken } from '~/modules/auth/api';
import type { TokenData } from '~/modules/auth/types';
import { dialog } from '~/modules/common/dialoger/state';
import Spinner from '~/modules/common/spinner';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { AuthenticateRoute } from '~/routes/auth';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));
const LegalText = lazy(() => import('~/modules/marketing/legal-texts'));

const formSchema = emailPasswordBodySchema;

interface Props {
  tokenData: TokenData | undefined;
  email: string;
  resetSteps: () => void;
  emailEnabled: boolean;
}

export const SignUpForm = ({ tokenData, email, resetSteps, emailEnabled }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token, tokenId } = useSearch({ from: AuthenticateRoute.id });

  // Handle basic sign up
  const { mutate: _signUp, isPending } = useMutation({
    mutationFn: signUp,
    onSuccess: () => {
      navigate({ to: '/auth/email-verification', replace: true });
    },
  });

  // Handle sign up with token to accept invitation
  const { mutate: _signUpWithToken, isPending: isPendingWithToken } = useMutation({
    mutationFn: signUpWithToken,
    onSuccess: () => {
      // Redirect to organization invitation page if there is a membership invitation
      const isMemberInvitation = tokenData?.organizationSlug && token && tokenId;
      if (isMemberInvitation) return navigate({ to: '/invitation/$token', replace: true, params: { token }, search: { tokenId } });
      return navigate({ to: config.welcomeRedirectPath, replace: true });
    },
  });

  // Create form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      password: '',
    },
  });

  // Handle submit action
  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    if (token && tokenId) return _signUpWithToken({ ...formValues, token });
    _signUp({ ...formValues });
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData?.organizationSlug
          ? t('common:invite_accept_proceed')
          : tokenData
            ? t('common:invite_create_account')
            : `${t('common:create_resource', { resource: t('common:account').toLowerCase() })}?`}{' '}
        <br />
        {!tokenData && (
          <Button variant="ghost" onClick={resetSteps} className="font-light mt-2 text-xl">
            {email}
            <ChevronDown size={16} className="ml-2" />
          </Button>
        )}
      </h1>

      <LegalNotice email={email} />

      {emailEnabled && (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="hidden">
                <FormControl>
                  <Input {...field} type="email" disabled={true} readOnly={true} placeholder={t('common:email')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              // Custom css due to html injection by browser extensions
              <FormItem className="gap-0">
                <FormControl>
                  <div className="relative">
                    <Input type="password" autoFocus placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                    <Suspense>
                      <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                    </Suspense>
                  </div>
                </FormControl>
                <FormMessage className="mt-2" />
              </FormItem>
            )}
          />
          <SubmitButton loading={isPending || isPendingWithToken} className="w-full">
            {t('common:sign_up')}
            <ArrowRight size={16} className="ml-2" />
          </SubmitButton>
        </form>
      )}
    </Form>
  );
};

export const LegalNotice = ({ email }: { email: string }) => {
  const { t } = useTranslation();

  const openDialog = (mode: 'terms' | 'privacy') => () => {
    const dialogComponent = (
      <Suspense fallback={<Spinner className="mt-[40vh] h-10 w-10" />}>
        <LegalText textFor={mode} />
      </Suspense>
    );

    dialog(dialogComponent, {
      className: 'md:max-w-3xl mb-10 px-6',
    });
  };

  return (
    <p className="font-light text-sm text-center space-x-1">
      <span>{t('common:legal_notice.text', { email })}</span>
      <Button type="button" variant="link" className="p-0 h-auto" onClick={openDialog('terms')}>
        {t('common:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button type="button" variant="link" className="p-0 h-auto" onClick={openDialog('privacy')}>
        {t('common:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {config.company.name}.</span>
    </p>
  );
};
