import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type SignInWithPasskeyData, sendMagicLink, signInWithPasskey } from 'sdk';
import { zCheckEmailBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import type { ConditionalMediationResult } from '~/modules/auth/passkey-credentials';
import { isConditionalMediationAvailable, startConditionalMediation } from '~/modules/auth/passkey-credentials';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { invitationResumePath, useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
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

export function SignInStep() {
  const { t } = useTranslation();
  const { email, resetSteps, restrictedMode, setStep, setSignedIn, setMagicLinkMode, inviteOtherAccount } =
    useAuthStore();

  const { lastUser, reset: clearUserStore } = useUserStore();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const navigateAfterAuth = useNavigateAfterAuth();

  const isMobile = window.innerWidth < 640;
  const abortRef = useRef<AbortController | null>(null);
  const [conditionalMediationSupported, setConditionalMediationSupported] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email },
  });

  useEffect(() => {
    if (!enabledStrategies.includes('passkey')) return;
    isConditionalMediationAvailable().then(setConditionalMediationSupported);
  }, []);

  const startMediation = () => {
    if (!conditionalMediationSupported) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const handleCredential = async (data: ConditionalMediationResult) => {
      try {
        const body: NonNullable<SignInWithPasskeyData['body']> = data;
        await signInWithPasskey({ body });
        setSignedIn(true);
        navigateAfterAuth();
      } catch {
        toaster.error(t('error:passkey_verification_failed'));
      }
    };

    startConditionalMediation(handleCredential, controller.signal).catch(() => {
      // Aborted or no credential selected, expected when retrying or navigating.
    });
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const { mutate: sendMagic, isPending: isSending } = useMutation({
    // An invitation in hand: the magic link returns here, so it can be confirmed as the account signed in to.
    mutationFn: () =>
      sendMagicLink({
        body: { email: form.getValues('email'), redirect: tokenId ? invitationResumePath(tokenId) : redirect },
      }),
    onSuccess: () => {
      setMagicLinkMode('signin');
      setStep('magicLinkSent', form.getValues('email'));
    },
  });

  // Without magic links the passkey signs in: the browser offers its passkeys for this site, and the one picked names
  // the account.
  const onSubmit = () => {
    if (isMagicLinkEnabled) return sendMagic();
    startMediation();
    setTimeout(() => {
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton?.focus();
    }, 0);
  };

  const resetAuth = () => {
    clearUserStore();
    resetSteps();
  };

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
          <NewHere onStep={(nextStep) => setStep(nextStep, form.getValues('email'))} />
        </>
      ) : (
        <h1 className="text-center text-2xl">
          {getTitle()} <br />
          <AuthEmailButton
            email={email}
            onClick={resetAuth}
            disabled={!!tokenId && !inviteOtherAccount}
            className="mt-2"
          />
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

          <SubmitButton loading={isMagicLinkEnabled && isSending} className="w-full gap-2">
            {isMagicLinkEnabled ? (
              <>
                <MailIcon />
                {t('c:magic_link_send')}
              </>
            ) : (
              <>
                {t('c:sign_in')}
                <ArrowRightIcon className="ml-2" />
              </>
            )}
          </SubmitButton>

          {enabledStrategies.includes('passkey') && <PasskeyStrategy type="authentication" />}
        </form>
      )}
    </Form>
  );
}

/** Where a visitor without an account goes from the neutral step: sign-up, the waitlist, or the invite-only notice. */
function NewHere({ onStep }: { onStep: (step: 'signUp' | 'waitlist') => void }) {
  const { t } = useTranslation();

  if (!appConfig.has.selfRegistration && !appConfig.has.waitlist) {
    return (
      <p className="text-center">
        {t('c:new_here')} {t('c:invite_only.text', { appName: appConfig.name })}
      </p>
    );
  }

  const step = appConfig.has.selfRegistration ? 'signUp' : 'waitlist';
  return (
    <p className="text-center">
      {t('c:new_here')}{' '}
      <Button type="button" variant="link" className="h-auto p-0 text-base" onClick={() => onStep(step)}>
        {step === 'signUp' ? t('c:sign_up') : t('c:request_access')}
      </Button>
    </p>
  );
}
