import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStop } from '~/modules/auth/api';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { useGeneralStore } from '~/store/general';

const StopImpersonation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { impersonating, setImpersonating } = useGeneralStore();

  const stopImpersonation = async () => {
    await impersonationStop();
    setImpersonating(false);
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    navigate({ to: config.defaultRedirectPath, replace: true });
    toast.success(t('common:success.stopped_impersonation'));
  };

  if (!impersonating) return null;

  return (
    <TooltipButton toolTipContent={t('common:stop_impersonation')} side="right" sideOffset={10} hideWhenDetached>
      <Button variant="ghost" className="w-12 h-12" onClick={stopImpersonation}>
        <UserX size="20" strokeWidth="1.5" />
      </Button>
    </TooltipButton>
  );
};

export default StopImpersonation;
