import { Outlet } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppAlert } from '~/modules/common/app-alert';
import { useNavigationStore } from '~/store/navigation';

export const AppContent = () => {
  const { t } = useTranslation();
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
      id="app-content"
      className={`transition-spacing duration-500 ease-in-out ${!focusView && addPadding} ${focusView && 'addPadding'}`}
    >
      <div
        className={`flex flex-col justify-between sm:min-h-[100vh] max-sm:min-h-[calc(100vh-4rem)] transition duration-300 ease-in-out ${
          !focusView && 'sm:ml-16'
        }`}
      >
        <main id="main-app-content" className="flex-1 flex flex-col" aria-label="Main Content">
          {/* Prerelease heads up */}
          <AppAlert id="prerelease" Icon={Info} className="rounded-none border-0 border-b">
            <strong className="mr-2">{t('about:prerelease')}</strong>
            {t('common:experiment_notice.text')}
          </AppAlert>

          <Outlet />
        </main>
      </div>
    </div>
  );
};
