import { useTranslation } from 'react-i18next';

import { ResetPasswordForm } from '~/modules/auth/reset-password/form';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

export const ResetPasswordRequest = ({ email }: { email: string }) => {
  const { t } = useTranslation();

  const openDialog = () => {
    dialog(<ResetPasswordForm email={email} />, {
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
