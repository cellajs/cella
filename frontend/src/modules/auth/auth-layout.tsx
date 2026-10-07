import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useMountedState } from '~/hooks/use-mounted-state';
import { AppFooterLinks, type FooterLinkProps } from '~/modules/common/app/app-footer';
import { Logo } from '~/modules/common/logo';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

export function AuthLayout() {
  const { t } = useTranslation();
  const { hasStarted, hasWaited } = useMountedState();
  const isSignInPage = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname === '/auth/authenticate' });

  const authFooterLinks: FooterLinkProps[] = [{ id: 'about', href: appConfig.aboutUrl }];

  if (!isSignInPage) authFooterLinks.unshift({ id: 'sign_in', href: '/auth/authenticate' });

  return (
    <div
      data-started={hasStarted}
      data-waited={hasWaited}
      className="group rich-gradient container flex min-h-[90svh] flex-col items-center before:fixed after:fixed sm:min-h-svh"
    >
      {/* Dividing-colony mark behind the auth card; the module lays it out as the page background and brings it in */}
      <Suspense fallback={null}>
        {/* overscan below 1 zooms in: 0.45 keeps the colony larger than the viewport at every stage, so the window always crops it */}
        {/* slowed further: the 0.45 overscan magnifies motion, so the clock compensates */}
        <MorphAnimation variant="colony" grid={192} stamp="plus" overscan={0.375} speed={0.4} />
      </Suspense>

      <div className="mt-auto mb-auto">
        <div className="mx-auto mt-8 mb-40 flex w-[90vw] xs:w-80 translate-y-4 flex-col justify-center gap-4 opacity-0 transition-[opacity,transform] duration-500 ease-out will-change-transform has-[.error-notice]:w-[90vw] group-data-[started=false]:scale-95 group-data-[started=true]:opacity-100 sm:w-lg has-[.error-notice]:sm:w-200">
          <main className="flex flex-col gap-4">
            <Outlet />
          </main>

          <Link to="/about" className="focus-effect mx-auto rounded-md p-4 hover:opacity-90 active:scale-95" aria-label={t('c:go_to_about')}>
            <Logo height={40} title={t('c:go_to_about')} />
          </Link>

          <AppFooterLinks className="justify-center" links={authFooterLinks} />
        </div>
      </div>
    </div>
  );
}
