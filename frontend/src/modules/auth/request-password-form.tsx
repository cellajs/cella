import { Button, SubmitButton } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

import { Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { requestPasswordEmail } from '~/modules/auth/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

export const RequestPasswordForm = ({ email = '' }: { email?: string }) => {
  const { t } = useTranslation();

  const isMobile = window.innerWidth < 640;

  const [emailValue, setEmailValue] = useState(email);

  // Send create/reset password email
  const { mutate: _requestPasswordEmail, isPending } = useMutation({
    mutationFn: requestPasswordEmail,
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      useDialoger.getState().remove();
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
        value={emailValue} // Set the default value instead of value
        onChange={(e) => setEmailValue(e.target.value)}
        required
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <SubmitButton disabled={!emailValue} loading={isPending} onClick={() => _requestPasswordEmail(emailValue)}>
          <Send size={16} className="mr-2" />
          {t('common:send_reset_link')}
        </SubmitButton>

        <Button type="reset" variant="secondary" onClick={() => setEmailValue('')} className={emailValue ? '' : 'invisible'}>
          {t('common:cancel')}
        </Button>
      </div>
    </div>
  );
};
