import { config } from 'config';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useGeneralStore } from '~/store/general';
import { useUserStore } from '~/store/user';

import { useTranslation } from 'react-i18next';

import { TooltipButton } from '~/modules/common/tooltip-button';
import AppNavLoader from '~/modules/navigation/bar-nav/loader';
import type { NavItem } from '~/nav-config';

interface BarNavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const BarNavButton = ({ navItem, isActive, onClick }: BarNavButtonProps) => {
  const { t } = useTranslation();

  const { user } = useUserStore();
  const theme = useGeneralStore((state) => state.theme);

  return (
    <TooltipButton toolTipContent={t(`common:${navItem.id}`)} side="right" sideOffset={10} hideWhenDetached>
      <Button
        id={`${navItem.id}-nav`}
        variant="ghost"
        data-theme={theme}
        data-active={isActive}
        className={`ring-inset focus-visible:ring-offset-0 group h-14 w-14 
          data-[active=true]:bg-background/50 hover:bg-background/30 text-primary-foreground data-[theme=none]:text-inherit`}
        onClick={() => onClick(navItem.id)}
      >
        {navItem.id === 'account' && user ? (
          <AvatarWrap
            type="user"
            className="border-[0.1rem] rounded-full border-primary group-hover:scale-110 transition-transform"
            id={user.id}
            name={user.name}
            url={user.thumbnailUrl}
          />
        ) : navItem.id === 'home' ? (
          <AppNavLoader />
        ) : (
          <navItem.icon className="group-hover:scale-110 transition-transform" strokeWidth={config.theme.strokeWidth} />
        )}
      </Button>
    </TooltipButton>
  );
};
