import { useEffect } from 'react';
import type { NavItem } from '~/modules/common/main-nav';
import MobileNavButton from '~/modules/common/main-nav/float-nav/button-container';
import type { NavItemId } from '~/nav-config';

const FloatNav = ({ items, onClick }: { items: NavItem[]; onClick: (id: NavItemId, index: number) => void }) => {
  useEffect(() => {
    const mainAppContent = document.getElementById('main-app-root');
    const height = 'min-h-[100vh]';
    if (!mainAppContent) return;

    mainAppContent.classList.add(height);
    return () => mainAppContent.classList.remove(height);
  }, []);

  return (
    <nav id="main-nav">
      {items.map((navItem: NavItem, idx: number) => {
        const firstButton = items.length > 1 && idx === 0;
        return (
          <MobileNavButton key={navItem.id} Icon={navItem.icon} onClick={() => onClick(navItem.id, idx)} direction={firstButton ? 'left' : 'right'} />
        );
      })}
    </nav>
  );
};

export default FloatNav;
