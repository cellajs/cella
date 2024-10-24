import { config } from 'config';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';

import { useTranslation } from 'react-i18next';

import type { NavItem } from '~/modules/common/main-nav';
import MainNavLoader from '~/modules/common/main-nav/bar-nav/bar-nav-loader';
import { TooltipButton } from '~/modules/common/tooltip-button';

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const NavButton = ({ navItem, isActive, onClick }: NavButtonProps) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { theme } = useThemeStore();

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
          <MainNavLoader />
        ) : (
          <navItem.icon className="group-hover:scale-110 transition-transform" strokeWidth={config.theme.strokeWidth} />
        )}
      </Button>
    </TooltipButton>
  );
};
