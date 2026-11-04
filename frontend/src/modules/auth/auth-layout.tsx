import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { AppFooterLinks, type FooterLinkProps } from '~/modules/common/app/app-footer';
import { Logo } from '~/modules/common/logo';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

export function AuthLayout() {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const isSignInPage = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname === '/auth/authenticate' });

  const authFooterLinks: FooterLinkProps[] = [{ id: 'about', href: appConfig.aboutUrl }];

  if (!isSignInPage) authFooterLinks.unshift({ id: 'sign_in', href: '/auth/authenticate' });

  return (
    <div className="group/auth-layout rich-gradient container flex min-h-[90svh] flex-col items-center overflow-y-clip pt-8 pb-40 before:fixed after:fixed sm:min-h-svh">
      <Suspense fallback={null}>
        {/* Overscan below 1 zooms in, a phone further, so the window always crops the colony; the zoom magnifies motion, hence the lower speed */}
        <MorphAnimation variant="colony" grid={192} stamp="plus" overscan={isMobile ? 0.26 : 0.31} speed={0.4} />
      </Suspense>

      {/* The box the veil measures itself on, clear of the content column's entrance transform */}
      <div className="relative my-auto">
        {/* Veil that calms the colony under the content */}
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out starting:opacity-0">
          <div className="rich-veil-gradient" />
          <div className="rich-veil-background" />
        </div>

        <div className="xs:w-80 flex w-[90vw] translate-y-4 flex-col gap-4 transition-[opacity,scale] duration-500 ease-out has-[.error-notice]:w-[90vw] sm:w-lg has-[.error-notice]:sm:w-200 starting:scale-95 starting:opacity-0">
          <main className="flex flex-col gap-4 focus:outline-hidden">
            <Outlet />
          </main>

          {/* An error notice brings its own footer, so this one hides */}
          <div className="contents group-has-[.error-notice]/auth-layout:hidden">
            <Link
              to="/about"
              draggable={false}
              className="focus-effect active:press mx-auto rounded-md p-4 transition-transform sm:hover:scale-105"
              aria-label={t('c:go_to_about')}
            >
              <Logo size="lg" title={t('c:go_to_about')} />
            </Link>

            <AppFooterLinks className="justify-center" links={authFooterLinks} />
          </div>
        </div>
      </div>
    </div>
  );
}
