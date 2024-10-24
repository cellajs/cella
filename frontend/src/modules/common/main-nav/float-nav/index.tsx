import { useEffect, useState } from 'react';
import type { NavItem } from '~/modules/common/main-nav';
import MobileNavButton from './button-container';

const FloatNav = ({ items, onClick }: { items: NavItem[]; onClick: (index: number) => void }) => {
  const [showButtons, setShowButtons] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // User is scrolling down, hide buttons. Up, show buttons
      if (currentScrollY > lastScrollY) setShowButtons(false);
      else setShowButtons(true);

      // Update last scroll position
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  useEffect(() => {
    const mainAppRoot = document.getElementById('main-app-root');

    if (mainAppRoot) mainAppRoot.style.height = 'auto';
    return () => {
      if (mainAppRoot) mainAppRoot.style.height = '';
    };
  }, []);

  return (
    <nav id="main-nav">
      {showButtons &&
        items.map((navItem: NavItem, idx: number) => {
          const firstButton = items.length > 1 && idx === 0;
          return (
            <MobileNavButton
              id={navItem.id}
              key={navItem.id}
              Icon={navItem.icon}
              onClick={() => onClick(idx)}
              direction={firstButton ? 'left' : 'right'}
            />
          );
        })}
    </nav>
  );
};

export default FloatNav;
