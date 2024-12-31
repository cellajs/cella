import { useTranslation } from 'react-i18next';

import { Button, SubmitButton } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

import { Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { sendResetPasswordEmail as baseSendResetPasswordEmail } from '~/modules/auth/api';
import { dialog } from '~/modules/common/dialoger/state';

const ResetPasswordDialog = ({ email }: { email: string }) => {
  const { t } = useTranslation();
  const [emailValue, setEmailValue] = useState(email);

  const { mutate: sendResetPasswordEmail, isPending } = useMutation({
    mutationFn: baseSendResetPasswordEmail,
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      dialog.remove();
    },
  });

  return (
    <div>
      <Input
        type="email"
        autoFocus
        className="mb-4"
        placeholder={t('common:email')}
        defaultValue={email} // Set the default value instead of value
        onChange={(e) => setEmailValue(e.target.value)}
        required
      />
      <SubmitButton className="w-full" disabled={!emailValue} loading={isPending} onClick={() => sendResetPasswordEmail(emailValue)}>
        <Send size={16} className="mr-2" />
        {t('common:send_reset_link')}
      </SubmitButton>
    </div>
  );
};

export const ResetPasswordRequest = ({ email }: { email: string }) => {
  const { t } = useTranslation();

  const openDialog = () => {
    dialog(<ResetPasswordDialog email={email} />, {
      id: 'send-reset-password',
      className: 'md:max-w-xl',
      title: t('common:reset_password'),
      description: t('common:reset_password.text'),
    });
  };

  return (
    <Button variant="ghost" type="button" size="sm" className="w-full font-normal" onClick={openDialog}>
      {t('common:forgot_password')}
    </Button>
  );
};
