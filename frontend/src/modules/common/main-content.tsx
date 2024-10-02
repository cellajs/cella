import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import AlertRenderer from '~/modules/common/main-alert/alert-render';
import { useNavigationStore } from '~/store/navigation';
import { type SheetAction, SheetObserver, type SheetT } from './sheeter/state';

export const MainContent = () => {
  const { keepMenuOpen, focusView } = useNavigationStore();

  const [padding, setPadding] = useState('pl-0');
  const [menuOpen, setMenuOpen] = useState(false);

  const clickContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPadding(keepMenuOpen && menuOpen ? 'xl:pl-80' : 'pl-0');
  }, [keepMenuOpen, menuOpen]);

  useEffect(() => {
    const handleAction = (action: SheetAction & SheetT) => {
      if (action.id !== 'menu-nav') return;
      setMenuOpen(!action.remove);
    };
    return SheetObserver.subscribe(handleAction);
  }, []);

  return (
    <div
      ref={clickContentRef}
      id="main-app-content"
      className={`transition-spacing duration-500 ease-in-out ${!focusView && padding} ${focusView && 'addPadding'}`}
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
