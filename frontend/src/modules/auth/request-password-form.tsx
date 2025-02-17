import { SubmitButton } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

import { Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { requestPasswordEmail } from '~/modules/auth/api';
import { dialog } from '~/modules/common/dialoger/state';

export const RequestPasswordForm = ({ email = '' }: { email?: string }) => {
  const { t } = useTranslation();

  const isMobile = window.innerWidth < 640;

  const [emailValue, setEmailValue] = useState(email);

  // Send create/reset password email
  const { mutate: _requestPasswordEmail, isPending } = useMutation({
    mutationFn: requestPasswordEmail,
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      dialog.remove();
    },
    onError: () => {
      document.getElementById('reset-email-field')?.focus();
    },
  });

  return (
    <div>
      <Input
        type="email"
        id="reset-email-field"
        autoFocus={!isMobile}
        className="mb-4"
        placeholder={t('common:email')}
        defaultValue={email} // Set the default value instead of value
        onChange={(e) => setEmailValue(e.target.value)}
        required
      />
      <SubmitButton className="w-full" disabled={!emailValue} loading={isPending} onClick={() => _requestPasswordEmail(emailValue)}>
        <Send size={16} className="mr-2" />
        {t('common:send_reset_link')}
      </SubmitButton>
    </div>
  );
};
