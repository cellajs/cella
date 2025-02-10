import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/modules/auth/api';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { useUserStore } from '~/store/user';

const StopImpersonation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { user } = useUserStore();

  const currentSession = useMemo(() => user?.sessions.find((s) => s.isCurrent), [user]);

  const stopImpersonation = async () => {
    await impersonationStop();
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  if (currentSession?.type !== 'impersonation') return null;

  return (
    <Button variant="ghost" className="w-12 h-12" onClick={stopImpersonation}>
      <UserX size="20" strokeWidth="1.5" />
    </Button>
  );
};

export default StopImpersonation;
