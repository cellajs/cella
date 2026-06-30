import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { appConfig } from 'shared';
import { useMountedState } from '~/hooks/use-mounted-state';
import { AppFooterLinks, type FooterLinkProps } from '~/modules/common/app/app-footer';
import { Logo } from '~/modules/common/logo';

const BgAnimation = lazy(() => import('~/modules/common/bg-animation/bg-animation'));

export function AuthLayout() {
  const { hasStarted, hasWaited } = useMountedState();
  const { location, resolvedLocation } = useRouterState();
  const pathname = (resolvedLocation ?? location).pathname;
  const isSignInPage = pathname === '/auth/authenticate';

  const authFooterLinks: FooterLinkProps[] = [{ id: 'about', href: appConfig.aboutUrl }];

  if (!isSignInPage) authFooterLinks.unshift({ id: 'sign_in', href: '/auth/authenticate' });

  return (
    <div
      data-started={hasStarted}
      data-waited={hasWaited}
      className="group rich-gradient container flex min-h-[90vh] flex-col items-center before:fixed after:fixed sm:min-h-screen"
    >
      {/* Render bg animation */}
      <Suspense fallback={<div className="fixed top-0 left-0 h-full w-full bg-loading-placeholder" />}>
        <div className="fixed top-0 left-0 h-full w-full transition-opacity delay-1000 duration-1000 group-data-[waited=false]:opacity-0 group-data-[waited=true]:opacity-100">
          <BgAnimation />
        </div>
      </Suspense>

      <div className="mt-auto mb-auto">
        <div className="mx-auto mt-8 mb-40 flex w-[90vw] xs:w-80 translate-y-4 flex-col justify-center gap-4 opacity-0 transition-[opacity,transform] duration-500 ease-out will-change-transform has-[.error-notice]:w-[90vw] group-data-[started=false]:scale-95 group-data-[started=true]:opacity-100 sm:w-lg has-[.error-notice]:sm:w-200">
          <Outlet />

          <Link to="/about" className="focus-effect mx-auto rounded-md p-4 hover:opacity-90 active:scale-95">
            <Logo height={40} />
          </Link>

          <AppFooterLinks className="justify-center" links={authFooterLinks} />
        </div>
      </div>
    </div>
  );
}
