import { Outlet, useMatches } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AppAlert } from '~/modules/common/app-alert';
import { AppFooter } from '~/modules/common/app-footer';
import { useNavigationStore } from '~/store/navigation';

export const AppContent = () => {
  const { t } = useTranslation();
  const { activeSheet, keepMenuOpen, setSheet, focusView } = useNavigationStore();
  const isLargeScreen = useBreakpoints('min', 'xl');

  const clickContentRef = useRef<HTMLDivElement>(null);
  const [showFooter, setShowFooter] = useState(false);

  // Move content to the right when the menu is open
  const addPadding = keepMenuOpen && activeSheet?.id === 'menu' ? 'xl:pl-80' : 'pl-0';

  // Close the sheet when clicking in content
  useEffect(() => {
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
  }, [keepMenuOpen, activeSheet, isLargeScreen]);

  // Custom hook for setting document title
  const matches = useMatches();

  useEffect(() => {
    const hide = matches.find((match) => match.staticData.hideFooter);
    if (!!hide === showFooter) setShowFooter(!showFooter);
  }, [matches]);

  return (
    <div
      ref={clickContentRef}
      id="app-content"
      className={`transition-spacing duration-500 ease-in-out ${!focusView && addPadding} ${focusView && 'addPadding'}`}
    >
      <div
        className={`flex flex-col justify-between min-h-[100vh] md:min-h-[100vh] transition duration-300 ease-in-out ${
          !focusView && 'md:ml-16'
        } md:mt-0`}
      >
        <main id="main-app-content" className="flex-1 flex flex-col" aria-label="Main Content">
          {/* Prerelease heads up */}
          <AppAlert id="prerelease" Icon={Info} className="rounded-none border-0 border-b">
            <strong className="mr-2">{t('common:prerelease')}</strong>
            {t('common:experiment_notice.text')}
          </AppAlert>

          <Outlet />
        </main>
        {showFooter && <AppFooter />}
      </div>
    </div>
  );
};
