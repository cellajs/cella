import { useMutation } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type CheckEmailData, checkEmail } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { AuthHeader, InvitationAvatar } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import type { TokenInvitation } from '~/modules/auth/types';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Form } from '~/modules/ui/field';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

export function CheckEmailStep({ invitation }: { invitation?: TokenInvitation }) {
  const { t } = useTranslation();

  const setStep = useAuthStore((state) => state.setStep);
  const setRestrictedMode = useAuthStore((state) => state.setRestrictedMode);
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);

  const title = invitation
    ? t('c:invite_join', { name: invitation.entityName })
    : inviteOtherAccount
      ? t('c:invite_sign_in')
      : appConfig.has.selfRegistration
        ? t('c:sign_in_or_up')
        : t('c:sign_in');

  const form = useForm<EmailFormValues>({ resolver: formResolver(emailFormSchema), defaultValues: { email: '' } });

  // A browser that never signed in to the address gets the step that does not say whether it has an account, as does
  // one past its lookup budget: that step is the whole answer to a 429, so no toast follows it.
  const { mutate: submitEmail, isPending } = useMutation({
    mutationFn: (body: CheckEmailData['body']) => checkEmail({ body }),
    meta: { suppressGlobalErrorToast: (error) => error.status === 429 },
    onSuccess: ({ recognized }) => {
      if (!recognized) setRestrictedMode(true);
      setStep('signIn', form.getValues('email'));
    },
    onError: (error) => {
      if (error.status !== 429) return;
      setRestrictedMode(true);
      setStep('signIn', form.getValues('email'));
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

      {(isStrategyEnabled('passkey') || isStrategyEnabled('magic')) && (
        <form noValidate onSubmit={form.handleSubmit((body) => submitEmail(body), defaultOnInvalid)} className="flex flex-col gap-4">
          <EmailField control={form.control} />
          <SubmitButton loading={isPending} size="block">
            {t('c:continue')}
            <ArrowRightIcon />
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
