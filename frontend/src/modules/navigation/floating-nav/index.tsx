import { useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import type { NavItem } from '~/modules/navigation';
import FloatingNavButton from '~/modules/navigation/floating-nav/button';

const FloatingNav = ({ items, onClick }: { items: NavItem[]; onClick: (index: number) => void }) => {
  const isMobile = useBreakpoints('max', 'sm');
  const { hasWaited } = useMounted();

  const [showButtons, setShowButtons] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainer = useRef<HTMLElement | Window | null>(null);

  useEffect(() => {
    if (!hasWaited) return;

    // On mobile, the scroll container is #app-content
    scrollContainer.current = isMobile ? document.getElementById('app-content') : window;

    if (!scrollContainer.current) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.current === window ? window.scrollY : (scrollContainer.current as HTMLElement).scrollTop;

      setShowButtons(currentScrollY <= lastScrollY.current);
      lastScrollY.current = currentScrollY;
    };

    const onScroll = () => requestAnimationFrame(handleScroll);

    scrollContainer.current.addEventListener('scroll', onScroll);
    return () => scrollContainer.current?.removeEventListener('scroll', onScroll);
  }, [isMobile, hasWaited]);

  useEffect(() => {
    const appLayout = document.getElementById('app-layout');
    if (appLayout) appLayout.style.height = '100vh';
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
