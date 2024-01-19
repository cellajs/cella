'use client';

import { Link } from '@tanstack/react-router';
import config from 'config';
import { Book, Github } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useInView } from 'react-intersection-observer';

import Logo from '~/components/logo';
import ThemeDropdown from '~/components/theme-dropdown';
import { Button, buttonVariants } from '~/components/ui/button';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import { cn } from '~/lib/utils';
import HamburgerButton from './hamburger';

const publicNavConfig = [
  {
    title: 'Features',
    hash: 'features',
  },
  {
    title: 'Integrations',
    hash: 'integrations',
  },
  {
    title: 'Pricing',
    hash: 'pricing',
  },
];

export function PublicNav() {
  const [showSheet, setShowSheet] = useState<boolean>(false);

  const toggleSheet = useCallback((isOpen: boolean) => {
    setShowSheet(isOpen);
  }, []);

  const { ref, inView } = useInView();

  const renderNavItems = () => {
    return publicNavConfig.map((item, index) => (
      <Link
        to="/about"
        hash={item.hash}
        key={`public-nav-${index}`}
        onClick={() => toggleSheet(false)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
      >
        {item.title}
      </Link>
    ));
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noreferrer');
  };

  return (
    <>
      <header className="absolute top-4 px-2 lg:top-8 lg:px-4 z-40 h-16 w-full">
        <div className="flex h-full items-center gap-2 px-2 max-w-[84rem] mx-auto justify-between transition-colors duration-300">
          <div className="flex h-full items-center gap-2 md:gap-6">
            <div className="md:hidden">
              <HamburgerButton isOpen={showSheet} toggle={setShowSheet} />
            </div>

            <Link to="/about" hash="" className="md:ml-2 hover:opacity-90 active:scale-95" aria-label="Go to about page">
              <Logo height={30} />
            </Link>

            {publicNavConfig?.length && <nav className="hidden h-full items-center gap-4 md:flex">{renderNavItems()}</nav>}
          </div>

          <div className={`gap-2 px-2 flex transition-all duration-300 ease-in-out ${showSheet ? 'translate-x-2 opacity-0' : 'delay-700'}`}>
            <div className="hidden sm:flex">
              <Button
                variant="ghost"
                onClick={() => {
                  openInNewTab(`${config.backendUrl}/docs`);
                }}
              >
                Docs
              </Button>
            </div>
            <div className="hidden sm:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  openInNewTab(config.company.githubUrl);
                }}
              >
                <Github strokeWidth={config.theme.strokeWidth} />
              </Button>
            </div>
            <ThemeDropdown />
            <Link to="/auth/sign-in" className={cn('ml-2', buttonVariants())}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <Sheet open={showSheet} onOpenChange={toggleSheet}>
        <SheetContent side="top" className={`fixed z-30 border-none ${showSheet ? '' : 'delay-300'}`}>
          <div
            ref={ref}
            className={`bg-background flex mt-2 flex-col gap-2 md:hidden items-stretch transition-opacity duration-200 ease-in-out ${
              inView && showSheet ? 'opacity-1 delay-300' : 'opacity-0'
            }`}
          >
            <HamburgerButton className="items-start w-42 ml-3" isOpen={showSheet} toggle={setShowSheet} />
            {renderNavItems()}
            <Button
              variant="secondary"
              size="lg"
              className="sm:hidden"
              onClick={() => {
                openInNewTab(`${config.backendUrl}/docs`);
              }}
            >
              <Book className="mr-2" strokeWidth={config.theme.strokeWidth} />
              Docs
            </Button>
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
