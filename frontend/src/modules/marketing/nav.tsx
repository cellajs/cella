import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { GithubIcon } from '~/modules/common/icons/github';
import { Logo } from '~/modules/common/logo';
import { marketingNavConfig } from '~/modules/marketing/marketing-config';
import { useIsAboutPage } from '~/modules/marketing/use-is-about-page';
// import { UserLanguage } from '~/modules/me/user-language';
import { UserTheme } from '~/modules/me/user-theme';
import { FloatingNav } from '~/modules/navigation/floating-nav/floating-nav';
import { useFloatingNavItems } from '~/modules/navigation/floating-nav/use-floating-nav-items';
import { Button } from '~/modules/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '~/modules/ui/drawer';

const hasDrawer = marketingNavConfig.length > 0 || !!appConfig.company.githubUrl;

interface MarketingNavLinksProps {
  onNavigate: () => void;
}

/** The config's page links; a hash link on the about page scrolls to its section in place. */
function MarketingNavLinks({ onNavigate }: MarketingNavLinksProps) {
  const { t } = useTranslation();
  const isAboutPage = useIsAboutPage();

  return marketingNavConfig.map(({ url, hash, id }) => (
    <Button
      key={id}
      variant="ghost"
      size="lg"
      render={
        <Link
          to={url}
          hash={hash}
          onClick={(e) => {
            if (hash && isAboutPage) {
              e.preventDefault();
              scrollToSectionById(hash);
            }
            onNavigate();
          }}
        />
      }
    >
      {t(id)}
    </Button>
  ));
}

export function MarketingNav() {
  const { t } = useTranslation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useBreakpointBelow('sm');
  const isAboutPage = useIsAboutPage();

  const floatingNavItems = useFloatingNavItems({
    idPrefix: 'marketing',
    hintKey: 'floating-menu-marketing',
    enabled: isMobile,
    onToggleMenu: hasDrawer ? () => setDrawerOpen((prev) => !prev) : undefined,
  });

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {isMobile && <FloatingNav items={floatingNavItems} resetTrigger={drawerOpen} />}

      <header className="absolute top-2 z-20 h-16 w-full px-2 sm:top-4 lg:top-8 lg:px-4">
        <div className="mx-auto flex h-full max-w-336 items-center justify-between gap-2">
          <div className="flex h-full items-center gap-2 ps-2 md:gap-6">
            <Link
              to="/about"
              hash=""
              replace={isAboutPage}
              draggable={false}
              className="focus-effect active:press rounded-md p-0.5 transition-transform sm:hover:scale-105"
              aria-label={t('c:go_to_about')}
            >
              <Logo title={t('c:go_to_about')} />
            </Link>

            {marketingNavConfig.length > 0 && (
              <nav className="hidden h-full items-center gap-1 sm:flex md:gap-4">
                <MarketingNavLinks onNavigate={closeDrawer} />
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2 px-2">
            {/* <UserLanguage /> */}

            <UserTheme buttonClassName={hasDrawer ? 'max-xs:hidden mr-2' : 'mr-2'} />

            {appConfig.company.githubUrl && (
              <Button
                variant="ghost"
                aria-label={t('c:github')}
                className="max-sm:hidden"
                size="icon"
                render={<a href={appConfig.company.githubUrl} target="_blank" rel="noreferrer" />}
              >
                <GithubIcon className="size-6" />
              </Button>
            )}

            <Button className="sm:ml-2" render={<Link to="/auth/authenticate" preload={false} />}>
              {t('c:sign_in')}
            </Button>
          </div>
        </div>
      </header>

      {hasDrawer && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="pb-8 sm:hidden">
            <DrawerTitle className="sr-only">{t('c:menu')}</DrawerTitle>
            <div className="flex flex-col gap-2 px-4">
              <UserTheme buttonClassName="xs:hidden m-1 self-end" />
              <Button variant="ghost" size="lg" render={<Link to="/about" hash="" replace={isAboutPage} onClick={closeDrawer} />}>
                {t('c:about')}
              </Button>
              <MarketingNavLinks onNavigate={closeDrawer} />
              {appConfig.company.githubUrl && (
                <Button size="lg" render={<a href={appConfig.company.githubUrl} target="_blank" rel="noreferrer" />} onClick={closeDrawer}>
                  <GithubIcon className="size-6" />
                  {t('c:github')}
                </Button>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
