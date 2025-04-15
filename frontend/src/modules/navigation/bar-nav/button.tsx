import { config } from 'config';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

import { useTranslation } from 'react-i18next';

import { type RefObject, useRef } from 'react';
import { TooltipButton } from '~/modules/common/tooltip-button';
import AppNavLoader from '~/modules/navigation/bar-nav/loader';
import type { NavItem } from '~/nav-config';

interface BarNavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (ref: RefObject<HTMLButtonElement | null>) => void;
}

export const BarNavButton = ({ navItem, isActive, onClick }: BarNavButtonProps) => {
  const { t } = useTranslation();
  const buttonRef = useRef(null);

  const { user } = useUserStore();
  const theme = useUIStore((state) => state.theme);

  return (
    <TooltipButton toolTipContent={t(`common:${navItem.id}`)} side="right" sideOffset={10} hideWhenDetached disabled>
      <Button
        id={`${navItem.id}-nav`}
        variant="ghost"
        ref={buttonRef}
        data-theme={theme}
        data-active={isActive}
        className={`ring-inset focus-visible:ring-offset-0 group h-14 w-14
          data-[active=true]:bg-background/50 hover:bg-background/30 text-primary-foreground data-[theme=none]:text-inherit`}
        onClick={() => {
          onClick(buttonRef);
        }}
      >
        {navItem.id === 'account' && user ? (
          <AvatarWrap
            type="user"
            className="border-[0.1rem] w-8 h-8 sm:w-9 sm:h-9 rounded-full border-primary group-hover:scale-110 transition-transform"
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
