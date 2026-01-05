import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { UserXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stopImpersonation as breakImpersonation } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/service';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { getAndSetMe } from '~/modules/me/helpers';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

const StopImpersonation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { impersonating, setImpersonating } = useUIStore();

  const stopImpersonation = async () => {
    await breakImpersonation();
    setImpersonating(false);
    await Promise.all([getAndSetMe(), getMenuData()]);
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
    toaster(t('common:success.stopped_impersonation'), 'success');
  };

  if (!impersonating) return null;

  return (
    <TooltipButton toolTipContent={t('common:stop_impersonation')} side="right" sideOffset={10} hideWhenDetached>
      <Button variant="ghost" className="w-12 h-12" onClick={stopImpersonation}>
        <UserXIcon size="20" strokeWidth="1.5" />
      </Button>
    </TooltipButton>
  );
};

export default StopImpersonation;
