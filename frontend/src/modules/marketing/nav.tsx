import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HamburgerButton } from '~/modules/common/hamburger';
import type { AboutSectionId } from '~/modules/marketing/about/about-page';
import { GithubIcon } from '~/modules/marketing/icons/github';
import { Logo } from '~/modules/marketing/logo';
import { marketingNavConfig } from '~/modules/marketing/marketing-config';
import { UserLanguage } from '~/modules/me/user-language';
import { UserTheme } from '~/modules/me/user-theme';
import { Button } from '~/modules/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '~/modules/ui/drawer';

export const MarketingNav = () => {
  const { t } = useTranslation();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  const handleNavClick = (target: AboutSectionId) => {
    scrollToSectionById(target);
    closeDrawer();
  };

  const renderNavItems = () => {
    return marketingNavConfig.map(({ url, hash, id }) => (
      <Button
        key={id}
        variant="ghost"
        size="lg"
        render={
          <Link
            to={url}
            hash={hash}
            replace={location.pathname === '/about'}
            draggable={false}
            onClick={(e) => {
              if (!hash) {
                closeDrawer();
                return;
              }
              if (location.pathname === '/about') {
                e.preventDefault();
                handleNavClick(hash);
              } else {
                closeDrawer();
              }
            }}
          />
        }
      >
        {t(id)}
      </Button>
    ));
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noreferrer');
  };

  return (
    <>
      <header className="absolute top-2 z-121 h-16 w-full px-2 sm:top-4 lg:top-8 lg:px-4">
        <div className="mx-auto flex h-full max-w-336 items-center justify-between gap-2 transition-colors duration-300">
          <div className="flex h-full items-center gap-2 md:gap-6">
            <div className="pointer-events-auto! md:hidden">
              <HamburgerButton
                isOpen={drawerOpen}
                toggle={() => setDrawerOpen((prev) => !prev)}
                className="data-[open=true]:pointer-events-auto!"
              />
            </div>

            <Link
              to="/about"
              hash=""
              replace={location.pathname === '/about'}
              className="focus-effect pointer-events-auto! relative rounded-md p-0.5 transition-transform sm:mr-1 sm:active:scale-100 sm:hover:scale-105 md:mr-2 md:ml-1 md:pr-4"
              aria-label="Go to about page"
            >
              <Logo height={36} />

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                className="absolute top-0.5 right-0.5 max-md:hidden"
              >
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

            {marketingNavConfig?.length && (
              <nav className="hidden h-full items-center gap-4 md:flex">{renderNavItems()}</nav>
            )}
          </div>

          <div
            className={`flex items-center gap-2 px-2 transition-opacity duration-300 ease-in-out ${drawerOpen ? 'opacity-0' : ''}`}
          >
            <UserLanguage />

            <UserTheme buttonClassName="max-xs:hidden mr-2" />

            {appConfig.company.githubUrl && (
              <Button
                variant="ghost"
                aria-label="Github repository"
                className="max-sm:hidden"
                size="icon"
                onClick={() => openInNewTab(appConfig.company.githubUrl)}
              >
                <GithubIcon strokeWidth={appConfig.theme.strokeWidth} />
              </Button>
            )}

            <Button className="sm:ml-2" render={<Link to="/auth/authenticate" preload={false} />}>
              {t('c:sign_in')}
            </Button>
          </div>
        </div>
      </header>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="pb-8 md:hidden">
          <span className="sr-only">
            <DrawerTitle>Navigation</DrawerTitle>
          </span>
          <div className="flex flex-col items-stretch gap-2 px-4">
            <UserTheme buttonClassName="xs:hidden bg-accent m-1 self-end" />
            {renderNavItems()}
            {appConfig.company.githubUrl && (
              <Button
                size="lg"
                className="sm:hidden"
                onClick={() => {
                  closeDrawer();
                  openInNewTab(appConfig.company.githubUrl);
                }}
              >
                <GithubIcon className="mr-2" strokeWidth={appConfig.theme.strokeWidth} />
                Github
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};
