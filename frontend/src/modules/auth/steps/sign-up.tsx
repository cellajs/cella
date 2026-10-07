import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { sendMagicLink } from 'sdk';
import { zCheckEmailBody } from 'sdk/zod.gen';
import { isStrategyEnabled } from 'shared';
import type { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import type { TokenData } from '~/modules/auth/types';
import { invitationResumePath } from '~/modules/auth/use-post-auth-redirect';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const emailEnabled = isStrategyEnabled('passkey');
const isMagicLinkEnabled = isStrategyEnabled('magic');

const formSchema = zCheckEmailBody;
type FormValues = z.infer<typeof formSchema>;

/**
 * Sign-up from the neutral sign-in step, on the address typed there. An invitation in hand is answered on its own step
 * (`InvitationStep`); here it only matters when the visitor signs up on another address than the invited one.
 */
export function SignUpStep({ tokenData }: { tokenData?: TokenData }) {
  const { t } = useTranslation();

  const { email, setStep, setMagicLinkMode } = useAuthStore(
    useShallow((state) => ({
      email: state.email,
      setStep: state.setStep,
      setMagicLinkMode: state.setMagicLinkMode,
    })),
  );
  const { redirect, tokenId } = useSearch({ strict: false });

  const isMobile = window.innerWidth < 640;

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email } });

  const { mutate: sendMagic, isPending } = useMutation({
    mutationFn: () => {
      const signUpEmail = form.getValues('email') || email;
      // Signing up on another address than the invited one: the invitation is not claimed at sign-up, so return to confirm it.
      const resumeInvitation = tokenId && tokenData && signUpEmail !== tokenData.email;
      const redirectTo = resumeInvitation ? invitationResumePath(tokenId) : redirect;
      return sendMagicLink({ body: { email: signUpEmail, redirect: redirectTo } });
    },
    onSuccess: () => {
      setMagicLinkMode('signup');
      setStep('magicLinkSent', form.getValues('email') || email);
    },
    onError: () => toaster.error(t('error:reported_try_later')),
  });

  const onSubmit = () => sendMagic();

  return (
    <Form {...form}>
      <h1 className="mt-4 text-center text-2xl">{t('c:sign_up')}</h1>

      <LegalNotice email={email || form.getValues('email')} mode="signup" />

      {(emailEnabled || isMagicLinkEnabled) && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="-mb-2 gap-0">
                {/* Hidden on purpose: the example address is the visible cue */}
                <FormLabel className="sr-only">{t('c:email')}</FormLabel>
                <FormControl>
                  <Input {...field} type="email" className="h-12" autoFocus={!isMobile} autoComplete="email" placeholder="name@example.com" />
                </FormControl>
                <FormMessage className="mt-2" />
              </FormItem>
            )}
          />

          <SubmitButton loading={isPending} icon={<MailIcon />} className="w-full">
            {t('c:magic_link_send_signup')}
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
