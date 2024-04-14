import { config } from 'config';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { AvatarWrap } from './avatar-wrap';

import { useTranslation } from 'react-i18next';

import { cn } from '~/lib/utils';
import type { NavItem } from './app-nav';
import AppNavLoader from './app-nav-loader';
import { TooltipButton } from './tooltip-button';

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const NavButton = ({ navItem, isActive, onClick }: NavButtonProps) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const { theme } = useThemeStore();

  const navIconColor = theme !== 'none' ? 'text-primary-foreground' : '';
  const activeClass = isActive ? 'bg-accent/20 hover:bg-accent/20' : '';

  return (
    <TooltipButton toolTipContent={t(`common:${navItem.id}`)} side="right" sideOffset={10} hideWhenDetached>
      <Button variant="ghost" className={cn('hover:bg-accent/10 group h-14 w-14', navIconColor, activeClass)} onClick={() => onClick(navItem.id)}>
        {navItem.id === 'account' ? (
          <AvatarWrap
            type="user"
            className="border-[1.5px] rounded-full border-primary group-hover:scale-110 transition-transform text-primary-foreground"
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
