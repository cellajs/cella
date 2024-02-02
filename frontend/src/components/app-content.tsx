import { Outlet } from '@tanstack/react-router';
import { RefObject, useEffect, useRef } from 'react';
import { AppAlert } from '~/components/app-alert';
import { AppFooter } from '~/components/app-footer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useNavigationStore } from '~/store/navigation';

const useClickInside = (ref: RefObject<HTMLDivElement>, callback: () => void) => {
  const handleClick = (e: MouseEvent) => {
    if (ref.current?.contains(e.target as Node)) {
      callback();
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  });
};

export const AppContent = () => {
  const { activeSheet, keepMenuOpen, setSheet } = useNavigationStore();
  const addPadding = keepMenuOpen && activeSheet?.id === 'menu' ? 'lg:pl-80' : 'pl-0';
  const isLargeScreen = useBreakpoints('min', 'lg');

  // Listen to clicks inside the app content and close the sheet if it's open
  const onClickInside = () => {
    if (keepMenuOpen && activeSheet?.id === 'menu' && isLargeScreen) return;
    setSheet(null);
  };

  const clickRef = useRef<HTMLDivElement>(null);
  useClickInside(clickRef, onClickInside);

  return (
    <div ref={clickRef} className={`transition-spacing duration-500 ease-in-out ${addPadding}`}>
      <div className="flex flex-col justify-between min-h-[calc(100vh-64px)] md:min-h-svh mt-16 transition duration-300 ease-in-out md:ml-16 md:mt-0">
        <main className="flex-1 flex flex-col" aria-label="Main Content">
          <AppAlert />
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
};
