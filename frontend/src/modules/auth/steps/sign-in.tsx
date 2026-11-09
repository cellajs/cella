import { useSearch } from '@tanstack/react-router';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { signInWithPasskey } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { AuthEmailButton, AuthHeader, InvitationAvatar } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { type ConditionalMediationResult, isConditionalMediationAvailable, startConditionalMediation } from '~/modules/auth/passkey-credentials';
import { useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import { useSendMagicLinkMutation } from '~/modules/auth/query';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import type { TokenInvitation } from '~/modules/auth/types';
import { useRestrictedMode } from '~/modules/auth/use-restricted-mode';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { Form } from '~/modules/ui/field';
import { useUserStore } from '~/modules/user/user-store';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const passkeyEnabled = isStrategyEnabled('passkey');
const magicLinkEnabled = isStrategyEnabled('magic');

export function SignInStep({ invitation }: { invitation?: TokenInvitation }) {
  const { t } = useTranslation();
  const { email, resetAuthStore, setStep, inviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      email: state.email,
      resetAuthStore: state.reset,
      setStep: state.setStep,
      inviteOtherAccount: state.inviteOtherAccount,
    })),
  );
  const restrictedMode = useRestrictedMode();

  const lastUser = useUserStore((state) => state.lastUser);
  const clearUserStore = useUserStore((state) => state.reset);
  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });
  const navigateAfterAuth = useNavigateAfterAuth();

  const abortRef = useRef<AbortController | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => () => abortRef.current?.abort(), []);

  const { mutate: sendLink, isPending: isSending } = useSendMagicLinkMutation();

  // Without magic links a passkey signs in: the one the browser offers names the account.
  const onSubmit = () => {
    if (magicLinkEnabled) return sendLink({ email: form.getValues('email'), mode: restrictedMode ? 'neutral' : 'signin' });
    startMediation();
    setTimeout(() => submitButtonRef.current?.focus(), 0);
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
      <AuthHeader
        image={invitation && <InvitationAvatar invitation={invitation} />}
        title={getTitle()}
        description={
          restrictedMode && !appConfig.has.selfRegistration && <SignUpDisabled onRequest={() => setStep('waitlist', form.getValues('email'))} />
        }
      >
        {!restrictedMode && <AuthEmailButton email={email} onClick={resetAuth} disabled={!!tokenId && !inviteOtherAccount} />}
      </AuthHeader>

      {restrictedMode && appConfig.has.selfRegistration && <LegalNotice mode="continue" />}

      {/* Built at submit time: a handler that reads a ref, handed over during render, keeps the compiler off this step */}
      {(passkeyEnabled || magicLinkEnabled) && (
        <form noValidate onSubmit={(event) => form.handleSubmit(onSubmit, defaultOnInvalid)(event)} className="flex flex-col gap-4">
          <EmailField control={form.control} hidden={!restrictedMode} />

          <SubmitButton ref={submitButtonRef} loading={isSending} size="block">
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
        </form>
      )}
    </Form>
  );
}
