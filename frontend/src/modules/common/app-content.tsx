import { Outlet } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AppAlert } from '~/modules/common/app-alert';
import { AppFooter } from '~/modules/common/app-footer';
import { useNavigationStore } from '~/store/navigation';

export const AppContent = () => {
  const { t } = useTranslation();
  const { activeSheet, keepMenuOpen, setSheet, focusView } = useNavigationStore();
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
    <div ref={clickContentRef} id="app-content" className={`transition-spacing duration-500 ease-in-out ${!focusView && addPadding}`}>
      <div
        className={`flex flex-col justify-between min-h-[calc(100vh-64px)] md:min-h-svh transition duration-300 ease-in-out ${
          !focusView && 'mt-16 md:ml-16'
        } md:mt-0`}
      >
        <main id="main-app-content" className="flex-1 flex flex-col" aria-label="Main Content">
          <AppAlert id="experimentalk" Icon={Info} className="rounded-none border-0 border-b">
            <strong className="mr-2">{t('common:prerelease')}</strong>
            {t('common:experiment_notice.text')}
          </AppAlert>
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
};
