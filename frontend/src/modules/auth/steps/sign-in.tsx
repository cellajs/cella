import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { sendMagicLink, signInWithPasskey } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import type { ConditionalMediationResult } from '~/modules/auth/passkey-credentials';
import { isConditionalMediationAvailable, startConditionalMediation } from '~/modules/auth/passkey-credentials';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { invitationResumePath, useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { Form } from '~/modules/ui/field';
import { useUserStore } from '~/modules/user/user-store';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const passkeyEnabled = isStrategyEnabled('passkey');
const magicLinkEnabled = isStrategyEnabled('magic');

export function SignInStep() {
  const { t } = useTranslation();
  const { email, resetAuthStore, restrictedMode, setStep, setMagicLinkSent, inviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      email: state.email,
      resetAuthStore: state.reset,
      restrictedMode: state.restrictedMode,
      setStep: state.setStep,
      setMagicLinkSent: state.setMagicLinkSent,
      inviteOtherAccount: state.inviteOtherAccount,
    })),
  );

  const lastUser = useUserStore((state) => state.lastUser);
  const clearUserStore = useUserStore((state) => state.reset);
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const navigateAfterAuth = useNavigateAfterAuth();
  const navigate = useNavigate();

  const abortRef = useRef<AbortController | null>(null);
  const [conditionalMediationSupported, setConditionalMediationSupported] = useState(false);

  const form = useForm<EmailFormValues>({ resolver: formResolver(emailFormSchema), defaultValues: { email } });

  useEffect(() => {
    if (!passkeyEnabled) return;
    isConditionalMediationAvailable().then(setConditionalMediationSupported);
  }, []);

  const startMediation = () => {
    if (!conditionalMediationSupported) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const handleCredential = async (data: ConditionalMediationResult) => {
      try {
        await signInWithPasskey({ body: data });
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
    onSuccess: () => setMagicLinkSent(form.getValues('email'), 'signin'),
    // An address an institution governs sends no link: its entry page takes over, keeping the redirect.
    onError: (error) => {
      const connectionId = error.type === 'sso_required' ? error.meta?.connectionId : undefined;
      if (typeof connectionId !== 'string') return;
      navigate({ to: '/auth/sso/$connectionId', params: { connectionId }, search: redirect ? { redirect } : {}, replace: true });
    },
  });

  // Without magic links a passkey signs in: the one the browser offers names the account.
  const onSubmit = () => {
    if (magicLinkEnabled) return sendMagic();
    startMediation();
    setTimeout(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus(), 0);
  };

  const resetAuth = () => {
    // Answering an invitation with another account: back to choosing the address, the invitation stays in hand.
    if (inviteOtherAccount) return setStep('checkEmail', '');
    clearUserStore();
    resetAuthStore();
  };

  const getTitle = () => {
    if (restrictedMode) return t('c:sign_in');
    if (tokenId) return t('c:invite_sign_in');
    if (lastUser) return t('c:welcome_back');
    return t('c:sign_in_as');
  };

  return (
    <Form {...form}>
      <AuthHeader title={getTitle()}>
        {restrictedMode ? (
          <NewHere onStep={(nextStep) => setStep(nextStep, form.getValues('email'))} />
        ) : (
          <AuthEmailButton email={email} onClick={resetAuth} disabled={!!tokenId && !inviteOtherAccount} />
        )}
      </AuthHeader>

      {/* Built at submit time: a handler that reads a ref, handed over during render, keeps the compiler off this step */}
      {(passkeyEnabled || magicLinkEnabled) && (
        <form noValidate onSubmit={(event) => form.handleSubmit(onSubmit, defaultOnInvalid)(event)} className="flex flex-col gap-4">
          <EmailField control={form.control} hidden={!restrictedMode} />

          <SubmitButton loading={isSending} className="w-full">
            {magicLinkEnabled ? (
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

          {passkeyEnabled && <PasskeyStrategy type="authentication" />}
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
    <p>
      {t('c:new_here')} <InlineLinkButton onClick={() => onStep('signUp')}>{t('c:sign_up')}</InlineLinkButton>
    </p>
  );
}
