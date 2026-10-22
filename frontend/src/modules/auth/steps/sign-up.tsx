import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { sendMagicLink } from 'sdk';
import { isStrategyEnabled } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { EmailField, type EmailFormValues, emailFormSchema } from '~/modules/auth/steps/email-field';
import type { TokenData } from '~/modules/auth/types';
import { invitationResumePath } from '~/modules/auth/use-post-auth-redirect';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Form } from '~/modules/ui/field';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const magicLinkEnabled = isStrategyEnabled('magic');

/**
 * Sign-up from the neutral sign-in step, on the address typed there. An invitation in hand is answered on its own step
 * (`InvitationStep`); here it only matters when the visitor signs up on another address than the invited one.
 */
export function SignUpStep({ tokenData }: { tokenData?: TokenData }) {
  const { t } = useTranslation();

  const email = useAuthStore((state) => state.email);
  const setMagicLinkSent = useAuthStore((state) => state.setMagicLinkSent);
  const { redirect, tokenId } = useSearch({ strict: false });

  const form = useForm<EmailFormValues>({ resolver: formResolver(emailFormSchema), defaultValues: { email } });
  const typedEmail = useWatch({ control: form.control, name: 'email' });

  const { mutate: sendMagic, isPending } = useMutation({
    mutationFn: (signUpEmail: string) => {
      // Signing up on another address than the invited one: the invitation is not claimed at sign-up, so return to confirm it.
      const resumeInvitation = tokenId && tokenData && signUpEmail !== tokenData.email;
      const redirectTo = resumeInvitation ? invitationResumePath(tokenId) : redirect;
      return sendMagicLink({ body: { email: signUpEmail, redirect: redirectTo } });
    },
    onSuccess: (_, signUpEmail) => setMagicLinkSent(signUpEmail, 'signup'),
  });

  return (
    <Form {...form}>
      <AuthHeader title={t('c:sign_up')} />

      <LegalNotice email={typedEmail} mode="signup" />

      {magicLinkEnabled && (
        <form noValidate onSubmit={form.handleSubmit((body) => sendMagic(body.email), defaultOnInvalid)} className="flex flex-col gap-4">
          <EmailField control={form.control} className="-mb-2" />

          <SubmitButton loading={isPending} icon={<MailIcon />} className="w-full">
            {t('c:magic_link_send_signup')}
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
