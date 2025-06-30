import { Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type RequestPasswordResponse, requestPassword } from '~/api.gen';
import { useMutation } from '~/hooks/use-mutations';
import type { ApiError } from '~/lib/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

export const RequestPasswordForm = ({ email = '' }: { email?: string }) => {
  const { t } = useTranslation();

  const isMobile = window.innerWidth < 640;

  const [emailValue, setEmailValue] = useState(email);

  // Send create/reset password email
  const { mutate: requestPasswordEmail, isPending } = useMutation<RequestPasswordResponse, ApiError, string>({
    mutationFn: (email) => requestPassword({ body: { email } }),
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      useDialoger.getState().remove();
    },
    onError: () => document.getElementById('reset-email-field')?.focus(),
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
        <SubmitButton disabled={!emailValue} loading={isPending} onClick={() => requestPasswordEmail(emailValue)}>
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
