import { Link as TanstackRouterLink } from '@tanstack/react-router';
import { config } from 'config';
import { Github } from 'lucide-react';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import Logo from '~/modules/common/logo';
import UserTheme from '~/modules/common/user-theme';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Sheet, SheetContent } from '~/modules/ui/sheet';
import HamburgerButton from '../common/hamburger';
import UserLanguage from '../common/user-language';

const marketingNavConfig = [
  { id: 'features', url: '/about', hash: 'features' },
  { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: `${config.backendUrl}/docs`, hash: '' },
];

type MarketingNav = {
  NavItems?: JSX.Element;
  onHandleMismatch?: (target: string) => void;
};

export function MarketingNav({ NavItems, onHandleMismatch }: MarketingNav) {
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

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noreferrer');
  };

  const renderNavItems = () => {
    return marketingNavConfig.map((item) => (
      <TanstackRouterLink
        to={item.url}
        hash={item.hash}
        replace={false}
        key={item.id}
        onClick={() => handleNavClick(item.hash, false)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
      >
        {t(item.id)}
      </TanstackRouterLink>
    ));
  };

  return (
    <>
      <header className="absolute top-2 sm:top-4 px-2 lg:top-8 lg:px-4 z-[101] h-16 w-full">
        <div className="flex h-full items-center gap-2 max-w-[84rem] mx-auto justify-between transition-colors duration-300">
          <div className="flex h-full items-center gap-2 md:gap-6">
            <div className="md:hidden">
              <HamburgerButton isOpen={showSheet} toggle={setShowSheet} />
            </div>

            <a
              href="/about"
              className="md:ml-2 hover:opacity-90 active:scale-95 relative"
              aria-label="Go to about page"
            >
              <Logo height={30} />

              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" className="absolute top-0 -right-4">
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
            </a>

            {marketingNavConfig?.length && <nav className="hidden h-full items-center gap-4 md:flex">{NavItems}</nav>}
          </div>

          <div className={`gap-2 px-2 flex transition-all duration-300 ease-in-out ${showSheet ? 'translate-x-2 opacity-0' : 'delay-700'}`}>
            <UserLanguage />

            <UserTheme className="max-xs:hidden" />

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
          </div>
        </div>
      </header>

      <Sheet open={showSheet} onOpenChange={toggleSheet}>
        <SheetContent side="top" className={`fixed z-[100] border-none ${showSheet ? '' : 'delay-300'}`}>
          <div
            ref={ref}
            className={`bg-background flex mt-2 flex-col gap-2 md:hidden items-stretch transition-opacity duration-200 ease-in-out ${
              inView && showSheet ? 'opacity-1 delay-300' : 'opacity-0'
            }`}
          >
            <div className="flex justify-between">
              <HamburgerButton className="items-start w-42 ml-1 -mt-2 !opacity-0" isOpen={showSheet} toggle={setShowSheet} />
              <UserTheme className="absolute top-5 right-4 xs:hidden" />
            </div>
            {NavItems ?? renderNavItems()}

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
