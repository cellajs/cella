import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { AppAlert } from '~/components/app-alert';
import { AppFooter } from '~/components/app-footer';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useNavigationStore } from '~/store/navigation';

export const AppContent = () => {
  const { activeSheet, keepMenuOpen, setSheet } = useNavigationStore();
  const addPadding = keepMenuOpen && activeSheet?.id === 'menu' ? 'lg:pl-80' : 'pl-0';
  const isLargeScreen = useBreakpoints('min', 'lg');

  const clickContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close the sheet when clicking in content
    const handleClickContent = (e: MouseEvent) => {
      if (clickContentRef.current?.contains(e.target as Node)) {
        if (keepMenuOpen && activeSheet?.id === 'menu' && isLargeScreen) return;
        setSheet(null);
      }
    };

    document.addEventListener('click', handleClickContent);
    return () => {
      document.removeEventListener('click', handleClickContent);
    };
  }, [activeSheet, isLargeScreen, keepMenuOpen, setSheet]);

  return (
    <div ref={clickContentRef} className={`transition-spacing duration-500 ease-in-out ${addPadding}`}>
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
