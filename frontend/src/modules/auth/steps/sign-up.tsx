import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { sendMagicLink } from 'sdk';
import { zCheckEmailBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import type { TokenData } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const emailEnabled = enabledStrategies.includes('passkey');
const isMagicLinkEnabled = enabledStrategies.includes('magic');

const formSchema = zCheckEmailBody;
type FormValues = z.infer<typeof formSchema>;

/**
 * Handles user sign-up, including standard registration and invitation token flow.
 */
export function SignUpStep({ tokenData }: { tokenData?: TokenData }) {
  const { t } = useTranslation();

  const { email, resetSteps, restrictedMode, setStep, setMagicLinkMode } = useAuthStore();

  const isMobile = window.innerWidth < 640;

  // Create form; sign-up is handled by OAuth/passkey providers rendered below.
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email },
  });

  // Send magic link for email-based sign-up
  const { mutate: sendMagic, isPending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email: form.getValues('email') || email } }),
    onSuccess: () => {
      setMagicLinkMode('signup');
      setStep('magicLinkSent', form.getValues('email') || email);
    },
    onError: () => toaster(t('error:reported_try_later'), 'error'),
  });

  const onSubmit = () => sendMagic();

  // Get title based on context
  const getTitle = () => {
    if (restrictedMode) return t('c:sign_up');
    if (tokenData?.inactiveMembershipId) return t('c:invite_accept_proceed');
    if (tokenData) return t('c:invite_create_account');
    return `${t('c:create_resource', { resource: t('c:account').toLowerCase() })}?`;
  };

  return (
    <Form {...form}>
      {restrictedMode ? (
        <h1 className="mt-4 text-center text-2xl">{getTitle()}</h1>
      ) : (
        <h1 className="text-center text-2xl">
          {getTitle()} <br />
          <AuthEmailButton email={email} onClick={resetSteps} className="mt-2" />
        </h1>
      )}

      <LegalNotice email={email || form.getValues('email')} mode="signup" />

      {(emailEnabled || isMagicLinkEnabled) && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="mt-0! flex flex-col gap-4">
          {restrictedMode && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="-mb-2 gap-0">
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      className="h-12"
                      autoFocus={!isMobile}
                      autoComplete="email"
                      placeholder={t('c:email')}
                    />
                  </FormControl>
                  <FormMessage className="mt-2" />
                </FormItem>
              )}
            />
          )}

          <SubmitButton loading={isPending} icon={<MailIcon size={16} />} className="w-full">
            {t('c:magic_link_send_signup')}
          </SubmitButton>
        </form>
      )}
    </Form>
  );
}
