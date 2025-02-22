import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/modules/auth/api';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

const StopImpersonation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isImpersonating = sessionStorage.getItem(`${config.slug}-impersonating`);

  const stopImpersonation = async () => {
    await impersonationStop();
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    sessionStorage.removeItem(`${config.slug}-impersonating`);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  if (!isImpersonating) return null;

  return (
    <Button variant="ghost" className="w-12 h-12" onClick={stopImpersonation}>
      <UserX size="20" strokeWidth="1.5" />
    </Button>
  );
};

export default StopImpersonation;
