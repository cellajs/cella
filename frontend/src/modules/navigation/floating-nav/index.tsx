import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import FloatingNavButton from '~/modules/navigation/floating-nav/button';
import type { NavItemId } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';

const SCROLL_THRESHOLD = 10; // Minimum scroll delta to toggle visibility

const FloatingNav = ({ onClick }: { onClick: (id: NavItemId) => void }) => {
  const isMobile = useBreakpoints('max', 'sm');
  const { hasWaited } = useMounted();
  const routerState = useRouterState();

  const [showButtons, setShowButtons] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const floatingItems = routerState.matches
    .flatMap((el) => el.staticData.floatingNavButtons || [])
    .filter((id, index, self) => self.indexOf(id) === index); // dedupe

  const items = isMobile ? navItems.filter((item) => floatingItems.includes(item.id)) : [];

  useBodyClass({ 'floating-nav': isMobile && items.length > 0 });

  // Hide buttons when scrolling down and show when scrolling up
  useEffect(() => {
    if (!hasWaited || !isMobile) return;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (Math.abs(delta) > SCROLL_THRESHOLD) {
        if (delta > 0 && showButtons) {
          setShowButtons(false); // scrolling down, hide
        } else if (delta < 0 && !showButtons) {
          setShowButtons(true); // scrolling up, show
        }
        lastScrollY.current = currentY;
      }

      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(handleScroll);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hasWaited, isMobile, showButtons]);

  return (
    <nav id="floating-nav">
      {items.map((navItem, index) => (
        <FloatingNavButton
          key={navItem.id}
          className={showButtons ? 'opacity-100' : 'opacity-0 -bottom-12 scale-50'}
          id={navItem.id}
          icon={navItem.icon}
          onClick={() => onClick(navItem.id)}
          direction={items.length > 1 && index === 0 ? 'left' : 'right'}
        />
      ))}
    </nav>
  );
};

export default FloatingNav;
