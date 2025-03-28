import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { emailPasswordBodySchema } from '#/modules/auth/schema';

import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { type RefObject, Suspense, lazy, useRef } from 'react';
import { signUp, signUpWithToken } from '~/modules/auth/api';
import type { TokenData } from '~/modules/auth/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { AuthenticateRoute } from '~/routes/auth';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));
const LegalText = lazy(() => import('~/modules/marketing/legal-texts'));

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
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

  const isMobile = window.innerWidth < 640;

  // Handle basic sign up
  const { mutate: _signUp, isPending } = useMutation({
    mutationFn: signUp,
    onSuccess: () => navigate({ to: '/auth/email-verification', replace: true }),
  });

  // Handle sign up with token to accept invitation
  const { mutate: _signUpWithToken, isPending: isPendingWithToken } = useMutation({
    mutationFn: signUpWithToken,
    onSuccess: () => {
      // Redirect to organization invitation page if there is a membership invitation
      const isMemberInvitation = tokenData?.organizationSlug && token && tokenId;
      const redirectPath = isMemberInvitation ? '/invitation/$token' : config.welcomeRedirectPath;
      return navigate({ to: redirectPath, replace: true, ...(token && tokenId && { params: { token }, search: { tokenId } }) });
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
          {enabledStrategies.includes('password') && (
            <>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  // Custom css due to html injection by browser extensions
                  <FormItem className="gap-0">
                    <FormControl>
                      <div className="relative">
                        <Input type="password" autoFocus={!isMobile} placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
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
            </>
          )}
        </form>
      )}
    </Form>
  );
};

export const LegalNotice = ({ email, mode = 'signup' }: { email: string; mode?: 'waitlist' | 'signup' }) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const termsButtonRef = useRef(null);
  const privacyButtonRef = useRef(null);

  const openDialog = (legalSubject: 'terms' | 'privacy', triggerRef: RefObject<HTMLButtonElement | null>) => () => {
    const dialogComponent = (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <LegalText textFor={legalSubject} />
      </Suspense>
    );

    createDialog(dialogComponent, {
      id: 'legal',
      triggerRef,
      className: 'md:max-w-3xl mb-10 px-6',
      drawerOnMobile: false,
    });
  };

  return (
    <p className="font-light text-sm text-center space-x-1">
      <span>{mode === 'signup' ? t('common:legal_notice.text', { email }) : t('common:legal_notice_waitlist.text', { email })}</span>
      <Button ref={termsButtonRef} type="button" variant="link" className="p-0 h-auto" onClick={openDialog('terms', termsButtonRef)}>
        {t('common:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button ref={privacyButtonRef} type="button" variant="link" className="p-0 h-auto" onClick={openDialog('privacy', privacyButtonRef)}>
        {t('common:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {config.company.name}.</span>
    </p>
  );
};
