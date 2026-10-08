import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type SignInWithPasskeyData, sendMagicLink, signInWithPasskey } from 'sdk';
import { zCheckEmailBody } from 'sdk/zod.gen';
import { appConfig, isStrategyEnabled } from 'shared';
import type { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';
import type { ApiError } from '~/lib/api';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import type { ConditionalMediationResult } from '~/modules/auth/passkey-credentials';
import { isConditionalMediationAvailable, startConditionalMediation } from '~/modules/auth/passkey-credentials';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { invitationResumePath, useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { useUserStore } from '~/modules/user/user-store';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const emailEnabled = isStrategyEnabled('passkey');
const isMagicLinkEnabled = isStrategyEnabled('magic');

const formSchema = zCheckEmailBody;
type FormValues = z.infer<typeof formSchema>;

export function SignInStep() {
  const { t } = useTranslation();
  const { email, resetSteps, restrictedMode, setStep, setSignedIn, setMagicLinkMode, inviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      email: state.email,
      resetSteps: state.resetSteps,
      restrictedMode: state.restrictedMode,
      setStep: state.setStep,
      setSignedIn: state.setSignedIn,
      setMagicLinkMode: state.setMagicLinkMode,
      inviteOtherAccount: state.inviteOtherAccount,
    })),
  );

  const lastUser = useUserStore((state) => state.lastUser);
  const clearUserStore = useUserStore((state) => state.reset);
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const navigateAfterAuth = useNavigateAfterAuth();
  const navigate = useNavigate();

  const isMobile = window.innerWidth < 640;
  const abortRef = useRef<AbortController | null>(null);
  const [conditionalMediationSupported, setConditionalMediationSupported] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email } });

  useEffect(() => {
    if (!isStrategyEnabled('passkey')) return;
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
    mutationFn: () => sendMagicLink({ body: { email: form.getValues('email'), redirect: tokenId ? invitationResumePath(tokenId) : redirect } }),
    onSuccess: () => {
      setMagicLinkMode('signin');
      setStep('magicLinkSent', form.getValues('email'));
    },
    // An address an institution governs sends no link: its entry page takes over, keeping the redirect.
    onError: (error: ApiError) => {
      const connectionId = error.type === 'sso_required' ? error.meta?.connectionId : undefined;
      if (typeof connectionId !== 'string') return;
      navigate({ to: '/auth/sso/$connectionId', params: { connectionId }, search: redirect ? { redirect } : {}, replace: true });
    },
  });

  // Without magic links a passkey signs in: the one the browser offers names the account.
  const onSubmit = () => {
    if (isMagicLinkEnabled) return sendMagic();
    startMediation();
    setTimeout(() => {
      const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton?.focus();
    }, 0);
  };

  const resetAuth = () => {
    // Answering an invitation with another account: back to choosing the address, the invitation stays in hand.
    if (inviteOtherAccount) return setStep('checkEmail', '');
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
          <AuthEmailButton email={email} onClick={resetAuth} disabled={!!tokenId && !inviteOtherAccount} className="mt-2" />
        </h1>
      )}

      {(emailEnabled || isMagicLinkEnabled) && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className={restrictedMode ? '-mb-2 gap-0' : 'hidden'}>
                {/* Hidden on purpose: the example address is the visible cue */}
                <FormLabel className="sr-only">{t('c:email')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={!restrictedMode}
                    type="email"
                    className="h-12"
                    autoFocus={restrictedMode && !isMobile}
                    autoComplete={restrictedMode ? 'email' : 'off'}
                    placeholder="name@example.com"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <SubmitButton loading={isMagicLinkEnabled && isSending} className="w-full">
            {isMagicLinkEnabled ? (
              <>
                <MailIcon />
                {t('c:magic_link_send')}
              </>
            ) : (
              <>
                {t('c:sign_in')}
                <ArrowRightIcon />
              </>
            )}
          </SubmitButton>

          {isStrategyEnabled('passkey') && <PasskeyStrategy type="authentication" />}
        </form>
      )}
    </Form>
  );
}

/** Where a visitor without an account goes from the neutral step: sign-up, or the notice that it is closed. */
function NewHere({ onStep }: { onStep: (step: 'signUp' | 'waitlist') => void }) {
  const { t } = useTranslation();

  if (!appConfig.has.selfRegistration) return <SignUpDisabled onRequest={() => onStep('waitlist')} />;

  return (
    <p className="text-center">
      {t('c:new_here')}{' '}
      <Button type="button" variant="link" className="h-auto p-0 text-base" onClick={() => onStep('signUp')}>
        {t('c:sign_up')}
      </Button>
    </p>
  );
}
