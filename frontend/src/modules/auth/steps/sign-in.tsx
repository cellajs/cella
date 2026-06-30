import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type CheckEmailData, checkEmail, type SignInWithPasskeyData, sendMagicLink, signInWithPasskey } from 'sdk';
import { zCheckEmailBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { ApiError } from '~/lib/api';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import {
  type ConditionalMediationResult,
  isConditionalMediationAvailable,
  startConditionalMediation,
} from '~/modules/auth/passkey-credentials';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { useUserStore } from '~/modules/user/user-store';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const emailEnabled = enabledStrategies.includes('passkey');
const isMagicLinkEnabled = enabledStrategies.includes('magic');

const formSchema = zCheckEmailBody;
type FormValues = z.infer<typeof formSchema>;

/**
 * Handles user sign-in, including token-based invitation flow.
 */
export function SignInStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { email, resetSteps, restrictedMode, setStep, setSignedIn, setMagicLinkMode } = useAuthStore();

  const { lastUser, reset: clearUserStore } = useUserStore();
  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });

  const isMobile = window.innerWidth < 640;
  const abortRef = useRef<AbortController | null>(null);
  const [conditionalMediationSupported, setConditionalMediationSupported] = useState(false);

  // Set up form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email },
  });

  // Check if conditional mediation is available for this browser.
  useEffect(() => {
    if (!enabledStrategies.includes('passkey')) return;
    isConditionalMediationAvailable().then(setConditionalMediationSupported);
  }, []);

  const startMediation = (inputEmail: string) => {
    const emailForMediation = inputEmail.trim();
    if (!conditionalMediationSupported || !emailForMediation) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const handleCredential = async (data: ConditionalMediationResult) => {
      try {
        const body: NonNullable<SignInWithPasskeyData['body']> = data;
        await signInWithPasskey({ body });
        setSignedIn(true);
        navigate({ to: appConfig.defaultRedirectPath, replace: true });
      } catch {
        toaster(t('error:passkey_verification_failed'), 'error');
      }
    };

    startConditionalMediation(handleCredential, controller.signal, emailForMediation).catch(() => {
      // Aborted or no credential selected — expected when retrying or navigating.
    });
  };

  // Only clean up pending mediation on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Handle sign in — verify email exists, then start passkey mediation for that verified email.
  const { mutate: _checkEmail, isPending } = useMutation<void, ApiError, CheckEmailData['body']>({
    mutationFn: (body) => checkEmail({ body }),
    onSuccess: () => {
      const submittedEmail = form.getValues('email');
      startMediation(submittedEmail);

      // Focus button after next render
      setTimeout(() => {
        const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitButton?.focus();
      }, 0);
    },
    onError: (error: ApiError) => {
      // In restricted mode, don't reset steps on 404 (user not found) to avoid email enumeration
      if (error?.status === 404 && !restrictedMode) return resetSteps();

      if (error.type !== 'invalid_credentials') return;
      form.reset(form.getValues());
    },
  });

  const { mutate: sendMagic, isPending: isSending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email: form.getValues('email') } }),
    onSuccess: () => {
      setMagicLinkMode('signin');
      setStep('magicLinkSent', form.getValues('email'));
    },
  });

  const onSubmit = (body: FormValues) => {
    if (isMagicLinkEnabled) return sendMagic();
    _checkEmail({ ...body });
  };

  const resetAuth = () => {
    clearUserStore();
    resetSteps();
  };

  // In restricted mode, show different title
  const getTitle = () => {
    if (restrictedMode) return t('c:sign_in');
    if (tokenId) return t('c:invite_sign_in');
    if (lastUser) return t('c:welcome_back');
    return t('c:sign_in_as');
  };

  return (
    <Form {...form}>
      {restrictedMode ? (
        <>
          <h1 className="mt-4 text-center text-2xl">{getTitle()}</h1>
          {appConfig.has.selfRegistration && (
            <p className="text-center">
              {t('c:new_here')}{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-base"
                onClick={() => setStep('signUp', form.getValues('email'))}
              >
                {t('c:sign_up')}
              </Button>
            </p>
          )}
        </>
      ) : (
        <h1 className="text-center text-2xl">
          {getTitle()} <br />
          <AuthEmailButton email={email} onClick={resetAuth} disabled={!!tokenId} className="mt-2" />
        </h1>
      )}

      {(emailEnabled || isMagicLinkEnabled) && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="mt-0! flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className={restrictedMode ? '-mb-2 gap-0' : 'hidden'}>
                <FormControl>
                  <Input
                    {...field}
                    disabled={!restrictedMode}
                    type="email"
                    className="h-12"
                    autoFocus={restrictedMode && !isMobile}
                    autoComplete={restrictedMode ? 'email' : 'off'}
                    placeholder={t('c:email')}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <SubmitButton loading={isMagicLinkEnabled ? isSending : isPending} className="w-full gap-2">
            {isMagicLinkEnabled ? (
              <>
                <MailIcon size={16} />
                {t('c:magic_link_send')}
              </>
            ) : (
              <>
                {t('c:sign_in')}
                <ArrowRightIcon size={16} className="ml-2" />
              </>
            )}
          </SubmitButton>

          {enabledStrategies.includes('passkey') && email && <PasskeyStrategy email={email} type="authentication" />}
        </form>
      )}
    </Form>
  );
}
