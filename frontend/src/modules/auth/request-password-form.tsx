import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type RequestPasswordResponse, requestPassword } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Button, SubmitButton } from '~/modules/ui/button';

import { Input } from '~/modules/ui/input';

/**
 * Renders the reset password request form.
 */
export function RequestPasswordForm({ email = '', onEmailChange }: { email?: string; onEmailChange?: () => void }) {
  const { t } = useTranslation();

  const isMobile = window.innerWidth < 640;

  const [emailValue, setEmailValue] = useState(email);

  // Send create/reset password email
  const { mutate: requestPasswordEmail, isPending } = useMutation<RequestPasswordResponse, ApiError, string>({
    mutationFn: (email) => requestPassword({ body: { email } }),
    onSuccess: () => {
      toaster(t('common:success.reset_link_sent'), 'success');
      useDialoger.getState().remove();
    },
    onError: () => document.getElementById('reset-email-field')?.focus(),
  });

  const handleEmailChange = (newEmail: string) => {
    setEmailValue(newEmail);
    if (onEmailChange && newEmail !== email) {
      onEmailChange();
    }
  };

  return (
    <div>
      <Input
        type="email"
        id="reset-email-field"
        autoFocus={!isMobile}
        className="mb-4 h-12"
        placeholder={t('common:email')}
        value={emailValue} // Set the default value instead of value
        onChange={(e) => handleEmailChange(e.target.value)}
        required
      />
      <div className="flex flex-col gap-2">
        <SubmitButton disabled={!emailValue} loading={isPending} onClick={() => requestPasswordEmail(emailValue)}>
          <SendIcon size={16} className="mr-2" />
          {t('common:send_reset_link')}
        </SubmitButton>

        <Button
          type="reset"
          variant="secondary"
          onClick={() => setEmailValue('')}
          className={emailValue ? '' : 'invisible'}
        >
          {t('common:cancel')}
        </Button>
      </div>
    </div>
  );
}
