import { useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import FloatingNavButton from '~/modules/navigation/floating-nav/button';
import { type NavItem, navItems } from '~/nav-config';

const FloatingNav = ({ onClick }: { onClick: (id: NavItem['id']) => void }) => {
  const isMobile = useBreakpoints('max', 'sm');
  const routerState = useRouterState();

  const { hasWaited } = useMounted();

  const [showButtons, setShowButtons] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainer = useRef<HTMLElement | Window | null>(null);

  const items = useMemo(() => {
    const floatingButtonIdsInRoute = routerState.matches.flatMap((el) => el.staticData.floatingNavButtons || []);
    return navItems.filter(({ id }) => {
      if (floatingButtonIdsInRoute.length && isMobile) return floatingButtonIdsInRoute.includes(id);
      return false;
    });
  }, [isMobile, routerState.matches]);

  useBodyClass({ 'floating-nav': !!items.length });

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
    <nav id="floating-nav">
      {showButtons &&
        items.map((navItem: NavItem, index: number) => {
          const firstButton = items.length > 1 && index === 0;
          return (
            <FloatingNavButton
              id={navItem.id}
              key={navItem.id}
              Icon={navItem.icon}
              onClick={() => onClick(navItem.id)}
              direction={firstButton ? 'left' : 'right'}
            />
          );
        })}
    </nav>
  );
};

export default FloatingNav;
