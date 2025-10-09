import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Link, useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { GithubIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import HamburgerButton from '~/modules/common/hamburger';
import Logo from '~/modules/common/logo';
import type { AboutSectionId } from '~/modules/marketing/about/about-page';
import { marketingNavConfig } from '~/modules/marketing/marketing-config';
import UserLanguage from '~/modules/me/user-language';
import UserTheme from '~/modules/me/user-theme';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Sheet, SheetContent, SheetTitle } from '~/modules/ui/sheet';
import { cn } from '~/utils/cn';

export const MarketingNav = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeSheet, setActiveSheet] = useState<boolean>(false);

  const toggleSheet = (isOpen: boolean) => {
    setActiveSheet(isOpen);
  };

  const handleNavClick = (target: AboutSectionId, isOpen = false) => {
    if (window.location.hash === `#${target}`) navigate({ to: '.', hash: 'top', replace: true });

    setTimeout(() => {
      navigate({ hash: target, replace: true });
    }, 20);

    setActiveSheet(isOpen);
  };

  const { ref, inView } = useInView();

  const renderNavItems = () => {
    return marketingNavConfig.map(({ url, hash, id }) => (
      <Link
        to={url}
        hash={hash}
        replace={location.pathname === '/about'}
        key={id}
        draggable="false"
        onClick={(e) => {
          setActiveSheet(false);
          if (window.location.hash !== `#${hash}`) return;
          if (!hash) return;
          e.preventDefault();
          handleNavClick(hash);
        }}
        className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
      >
        {t(id)}
      </Link>
    ));
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noreferrer');
  };

  const hamburgerToggle = () => {
    const isActive = !activeSheet;
    setActiveSheet(isActive);
    if (isActive) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="absolute top-2 sm:top-4 px-2 lg:top-8 lg:px-4 z-121 h-16 w-full">
        <div className="flex h-full items-center gap-2 max-w-[84rem] mx-auto justify-between transition-colors duration-300">
          <div className="flex h-full items-center gap-2 md:gap-6">
            <div className="md:hidden pointer-events-auto!">
              <HamburgerButton isOpen={activeSheet} toggle={hamburgerToggle} />
            </div>

            <Link
              to="/about"
              hash=""
              replace={location.pathname === '/about'}
              className="md:ml-1 sm:mr-1 md:mr-2 md:pr-4 hover:opacity-90 active:scale-95 relative p-0.5 rounded-md focus-effect pointer-events-auto!"
              aria-label="Go to about page"
            >
              <Logo height={36} />

              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" className="max-md:hidden absolute top-0.5 right-0.5">
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

          <div
            className={`gap-2 px-2 flex items-center transition-opacity duration-300 ease-in-out ${activeSheet ? 'opacity-0' : 'max-sm:delay-700'}`}
          >
            <UserLanguage />

            <UserTheme buttonClassName="max-xs:hidden mr-2" />

            {appConfig.company.githubUrl && (
              <Button
                variant="ghost"
                aria-label="Github repository"
                className="max-sm:hidden"
                size="icon"
                onClick={() => {
                  openInNewTab(appConfig.company.githubUrl);
                }}
              >
                <GithubIcon strokeWidth={appConfig.theme.strokeWidth} />
              </Button>
            )}

            <Link to="/auth/authenticate" preload={false} className={cn('sm:ml-2 max-xs:hidden"', buttonVariants())}>
              {t('common:sign_in')}
            </Link>
          </div>
        </div>
      </header>

      <Sheet open={activeSheet} onOpenChange={toggleSheet}>
        <SheetContent
          aria-describedby={undefined}
          side="top"
          showCloseButton={false}
          className={`fixed z-120 border-none pb-8 ${activeSheet ? '' : 'delay-300'}`}
        >
          <VisuallyHidden>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden>
          <div
            ref={ref}
            className={`flex mt-2 flex-col pt-14 gap-2 md:hidden items-stretch transition-opacity duration-200 ease-in-out ${
              inView && activeSheet ? 'opacity-100 delay-300' : 'opacity-0'
            }`}
          >
            <div className="flex justify-between mb-4">
              <UserTheme buttonClassName="absolute top-5 right-5 xs:hidden" />
            </div>
            {renderNavItems()}
            {appConfig.company.githubUrl && (
              <Button
                size="lg"
                className="sm:hidden"
                onClick={() => {
                  setActiveSheet(false);
                  openInNewTab(appConfig.company.githubUrl);
                }}
              >
                <GithubIcon className="mr-2" strokeWidth={appConfig.theme.strokeWidth} />
                Github
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
