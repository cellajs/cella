import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import AlertRenderer from '~/modules/common/main-alert/alert-render';
import { useNavigationStore } from '~/store/navigation';

export const MainContent = () => {
  const { activeSheet, keepMenuOpen, setSheet, focusView } = useNavigationStore();

  const clickContentRef = useRef<HTMLDivElement>(null);

  // Move content to the right when the menu is open
  const addPadding = keepMenuOpen && activeSheet?.id === 'menu' ? 'xl:pl-80' : 'pl-0';

  // Close the sheet when clicking in content
  useEffect(() => {
    const handleClickContent = (e: MouseEvent) => {
      if (clickContentRef.current?.contains(e.target as Node)) {
        setSheet(null, 'routeChange');
      }
    };

    document.addEventListener('click', handleClickContent);
    return () => {
      document.removeEventListener('click', handleClickContent);
    };
  }, []);

  return (
    <div
      ref={clickContentRef}
      id="main-app-content"
      className={`transition-spacing duration-500 ease-in-out ${!focusView && addPadding} ${focusView && 'addPadding'}`}
    >
      <div
        className={`flex flex-col justify-between sm:min-h-[100vh] max-sm:min-h-[calc(100vh-4rem)] transition duration-300 ease-in-out ${
          !focusView && 'sm:ml-16'
        }`}
      >
        <main id="main-block-app-content" className="flex-1 flex flex-col" aria-label="Main Content">
          <AlertRenderer />

          <Outlet />
        </main>
      </div>
    </div>
  );
};
