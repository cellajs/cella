import { useMutation } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type CheckEmailData, checkEmail } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { ApiError } from '~/lib/api';
import { AuthHeader, InvitationAvatar } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { useSendMagicLinkMutation } from '~/modules/auth/query';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import type { TokenInvitation } from '~/modules/auth/types';
import { useRestrictedMode } from '~/modules/auth/use-restricted-mode';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Form } from '~/modules/ui/field';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const magicLinkEnabled = isStrategyEnabled('magic');

/** A browser past its lookup budget counts as any other: that is the whole answer to a 429, and no toast follows it. */
const isRecognizedBrowser = async (body: CheckEmailData['body']) => {
  try {
    return (await checkEmail({ body })).recognized;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return false;
    throw error;
  }
};

export function CheckEmailStep({ invitation }: { invitation?: TokenInvitation }) {
  const { t } = useTranslation();

  const setStep = useAuthStore((state) => state.setStep);
  const setRestrictedMode = useAuthStore((state) => state.setRestrictedMode);
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);
  const restrictedMode = useRestrictedMode();

  const title = invitation
    ? t('c:invite_join', { name: invitation.entityName })
    : inviteOtherAccount
      ? t('c:invite_sign_in')
      : appConfig.has.selfRegistration
        ? t('c:sign_in_or_up')
        : t('c:sign_in');

  const form = useForm<EmailFormValues>({ resolver: formResolver(emailFormSchema), defaultValues: { email: '' } });

  const { mutate: sendLink, isPending: isSending } = useSendMagicLinkMutation();

  // Only a browser that signed in to the address reaches the sign-in step. Any other gets the same link and the same page, account or not.
  const { mutate: submitEmail, isPending: isChecking } = useMutation({
    mutationFn: async (body: CheckEmailData['body']) => !restrictedMode && (await isRecognizedBrowser(body)),
    onSuccess: (recognized, { email }) => {
      if (recognized) return setStep('signIn', email);
      if (magicLinkEnabled) return sendLink({ email, mode: 'neutral' });
      setRestrictedMode(true);
      setStep('signIn', email);
    },
  });

  return (
    <Form {...form}>
      {/* An invitation in hand needs no sign-up, so its own line stands alone */}
      <AuthHeader
        image={invitation && <InvitationAvatar invitation={invitation} />}
        title={title}
        description={
          inviteOtherAccount
            ? t('c:invite_sign_in.text')
            : !appConfig.has.selfRegistration && <SignUpDisabled onRequest={() => setStep('waitlist', form.getValues('email'))} />
        }
      />

      {appConfig.has.selfRegistration && !inviteOtherAccount && <LegalNotice mode="continue" />}

      {(isStrategyEnabled('passkey') || magicLinkEnabled) && (
        <form noValidate onSubmit={form.handleSubmit((body) => submitEmail(body), defaultOnInvalid)} className="flex flex-col gap-4">
          <EmailField control={form.control} />
          <SubmitButton loading={isChecking || isSending} size="block">
            {t('c:continue')}
            <ArrowRightIcon />
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
