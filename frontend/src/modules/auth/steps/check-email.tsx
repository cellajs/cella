import { useMutation } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type CheckEmailData, type CheckEmailResponse, checkEmail } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import type { ApiError } from '~/lib/api';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { SignUpDisabled } from '~/modules/auth/sign-up-disabled';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Form } from '~/modules/ui/field';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const passkeyEnabled = isStrategyEnabled('passkey');
const magicLinkEnabled = isStrategyEnabled('magic');

export function CheckEmailStep() {
  const { t } = useTranslation();

  const setStep = useAuthStore((state) => state.setStep);
  const setRestrictedMode = useAuthStore((state) => state.setRestrictedMode);
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);

  const title = inviteOtherAccount ? t('c:invite_sign_in') : appConfig.has.selfRegistration ? t('c:sign_in_or_up') : t('c:sign_in');

  const form = useForm<EmailFormValues>({ resolver: formResolver(emailFormSchema), defaultValues: { email: '' } });

  // A browser that never signed in to the address gets the step that does not say whether it has an account.
  const { mutate: _checkEmail, isPending } = useMutation<CheckEmailResponse, ApiError, CheckEmailData['body']>({
    mutationFn: (body) => checkEmail({ body }),
    onSuccess: ({ recognized }) => {
      if (!recognized) setRestrictedMode(true);
      setStep('signIn', form.getValues('email'));
    },
    onError: (error: ApiError) => {
      if (error.status !== 429) return;
      setRestrictedMode(true);
      setStep('signIn', form.getValues('email'));
    },
  });

  const onSubmit = (body: EmailFormValues) => _checkEmail(body);

  return (
    <Form {...form}>
      <AuthHeader title={title}>
        {inviteOtherAccount && <p className="font-light">{t('c:invite_sign_in.text')}</p>}
        {/* An invitation in hand needs no sign-up, so its own line above stands alone */}
        {!appConfig.has.selfRegistration && !inviteOtherAccount && <SignUpDisabled onRequest={() => setStep('waitlist', form.getValues('email'))} />}
      </AuthHeader>

      {(passkeyEnabled || magicLinkEnabled) && (
        <form noValidate onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4">
          <EmailField control={form.control} />
          <SubmitButton loading={isPending} className="w-full">
            {t('c:continue')}
            <ArrowRightIcon />
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
