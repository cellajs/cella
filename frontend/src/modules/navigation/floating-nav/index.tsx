import { useEffect, useState } from 'react';
import type { NavItem } from '~/modules/navigation';
import FloatingNavButton from './button';

const FloatingNav = ({ items, onClick }: { items: NavItem[]; onClick: (index: number) => void }) => {
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

  // TODO: can be improved?
  useEffect(() => {
    const appLayout = document.getElementById('app-layout');

    if (appLayout) appLayout.style.height = 'auto';
    return () => {
      if (appLayout) appLayout.style.height = '';
    };
  }, []);

  return (
    <nav id="app-nav">
      {showButtons &&
        items.map((navItem: NavItem, idx: number) => {
          const firstButton = items.length > 1 && idx === 0;
          return (
            <FloatingNavButton
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

export default FloatingNav;
