import { useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sendMagicLink } from 'sdk';
import { useAuthStore } from '~/modules/auth/auth-store';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

/**
 * Button that sends a magic link sign-in email and transitions to the magicLinkSent step.
 */
export function MagicLinkStrategy({ email }: { email?: string }) {
  const { t } = useTranslation();
  const { setStep, setMagicLinkMode, email: storeEmail } = useAuthStore();

  const targetEmail = email || storeEmail;

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email: targetEmail } }),
    onSuccess: () => {
      setMagicLinkMode('signin');
      setStep('magicLinkSent', targetEmail);
    },
    onError: () => toaster(t('error:reported_try_later'), 'error'),
  });

  if (!targetEmail) return null;

  return (
    <Button type="button" variant="outline" onClick={() => send()} disabled={isPending} className="w-full gap-1.5">
      <MailIcon />
      {t('c:magic_link_send')}
    </Button>
  );
}
