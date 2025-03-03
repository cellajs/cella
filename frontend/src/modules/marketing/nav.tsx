import { Link } from '@tanstack/react-router';
import { config } from 'config';
import { Github } from 'lucide-react';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';

import { useTranslation } from 'react-i18next';
import HamburgerButton from '~/modules/common/hamburger';
import Logo from '~/modules/common/logo';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Sheet, SheetContent, SheetHiddenTitle } from '~/modules/ui/sheet';
import UserLanguage from '~/modules/users/user-language';
import UserTheme from '~/modules/users/user-theme';
import { cn } from '~/utils/cn';

const marketingNavConfig = [
  { id: 'features', url: '/about', hash: 'features' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: `${config.backendUrl}/docs`, hash: '' },
];

export function MarketingNav({ onHandleMismatch }: { onHandleMismatch?: (target: string) => void }) {
  const { t } = useTranslation();
  const [showSheet, setShowSheet] = useState<boolean>(false);

  const toggleSheet = (isOpen: boolean) => {
    setShowSheet(isOpen);
  };

  const handleNavClick = (target: string, isOpen: boolean) => {
    if (onHandleMismatch) onHandleMismatch(target);
    setShowSheet(isOpen);
  };

  const { ref, inView } = useInView();

  const renderNavItems = () => {
    return marketingNavConfig.map((item) => (
      <Link
        to={item.url}
        hash={item.hash}
        replace={location.pathname === '/about'}
        key={item.id}
        onClick={() => handleNavClick(item.hash, false)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
      >
        {t(item.id)}
      </Link>
    ));
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noreferrer');
  };

  return (
    <>
      <header className="absolute top-2 sm:top-4 px-2 lg:top-8 lg:px-4 z-121 h-16 w-full">
        <div className="flex h-full items-center gap-2 max-w-[84rem] mx-auto justify-between transition-colors duration-300">
          <div className="flex h-full items-center gap-2 md:gap-6">
            <div className="md:hidden">
              <HamburgerButton isOpen={showSheet} toggle={setShowSheet} />
            </div>

            <Link
              to="/about"
              hash=""
              replace={location.pathname === '/about'}
              className="md:ml-2 sm:mr-2 md:mr-4 pr-4 hover:opacity-90 active:scale-95 relative"
              aria-label="Go to about page"
            >
              <Logo height={36} />

              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" className="absolute top-0 right-0">
                <title>We support Ukraine</title>
                <g fill="none">
                  <path
                    fill="#FFD500"
                    d="M0 6s1 .5 3.2.5c2 0 3.5-1 5.6-1 1.7 0 3.2.5 3.2.5v4c0 .4-.3.7-.7.6-.6-.1-1.5-.3-2.5-.3-2 0-3.5 1-5.6 1-1.3 0-2.2-.2-2.7-.4a.7.7 0 0 1-.5-.6V6Z"
                  />
                  <path
                    fill="#0974E5"
                    d="M0 2c0-.4.4-.6.7-.5l2.5.2c2 0 3.5-1 5.6-1 1 0 2 .2 2.6.4.4 0 .6.4.6.7V6s-1.5-.5-3.2-.5c-2 0-3.5 1-5.6 1C1.1 6.5 0 6 0 6V2Z"
                  />
                </g>
              </svg>
            </Link>

            {marketingNavConfig?.length && <nav className="hidden h-full items-center gap-4 md:flex">{renderNavItems()}</nav>}
          </div>

          <div className={`gap-2 px-2 flex items-center transition-opacity duration-300 ease-in-out ${showSheet ? 'opacity-0' : 'max-sm:delay-700'}`}>
            <UserLanguage />

            <UserTheme buttonClassName="max-xs:hidden mr-2" />

            <Button
              variant="ghost"
              aria-label="Github repository"
              className="max-sm:hidden"
              size="icon"
              onClick={() => {
                openInNewTab(config.company.githubUrl);
              }}
            >
              <Github strokeWidth={config.theme.strokeWidth} />
            </Button>

            <Link to="/auth/authenticate" preload={false} className={cn('sm:ml-2 max-xs:hidden"', buttonVariants())}>
              {t('common:sign_in')}
            </Link>
          </div>
        </div>
      </header>

      <Sheet open={showSheet} onOpenChange={toggleSheet}>
        <SheetContent
          aria-describedby={undefined}
          side="top"
          hideClose={true}
          className={`fixed z-120 border-none pb-8 ${showSheet ? '' : 'delay-300'}`}
        >
          <SheetHiddenTitle>Navigation</SheetHiddenTitle>
          <div
            ref={ref}
            className={`bg-background flex mt-2 flex-col gap-2 md:hidden items-stretch transition-opacity duration-200 ease-in-out ${
              inView && showSheet ? 'opacity-100 delay-300' : 'opacity-0'
            }`}
          >
            <div className="flex justify-between mb-4">
              <HamburgerButton className="items-start -ml-2 mt-3 opacity-0!" isOpen={showSheet} toggle={setShowSheet} />
              <UserTheme buttonClassName="absolute top-5 right-5 xs:hidden" />
            </div>
            {renderNavItems()}
            <Button
              size="lg"
              className="sm:hidden"
              onClick={() => {
                openInNewTab(config.company.githubUrl);
              }}
            >
              <Github className="mr-2" strokeWidth={config.theme.strokeWidth} />
              Github
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
