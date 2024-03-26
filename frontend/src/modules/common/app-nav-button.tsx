import { config } from 'config';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { AvatarWrap } from './avatar-wrap';

import { useTranslation } from 'react-i18next';

import { cn } from '~/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';
import type { NavItem } from './app-nav';
import HomeIconLoader from './home-icon-loader';

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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" className={cn('hover:bg-accent/10 group h-14 w-14', navIconColor, activeClass)} onClick={() => onClick(navItem.id)}>
          {navItem.id === 'account' ? (
            <AvatarWrap
              type="user"
              className="border-[1.5px] border-primary group-hover:scale-110 transition-transform text-primary-foreground"
              id={user.id}
              name={user.name}
              url={user.thumbnailUrl}
            />
          ) : navItem.id === 'home' ? (
            <HomeIconLoader />
          ) : (
            <navItem.icon className="group-hover:scale-110 transition-transform" strokeWidth={config.theme.strokeWidth} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} hideWhenDetached>
        {t(`common:${navItem.id}`)}
      </TooltipContent>
    </Tooltip>
  );
};
