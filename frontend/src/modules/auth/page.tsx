import { Link, Outlet } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import useMounted from '~/hooks/use-mounted';
import Logo from '~/modules/common/logo';
import { type FooterLinkProps, FooterLinks } from '~/modules/common/main-footer';

// Auth footer links
const authFooterLinks: FooterLinkProps[] = [{ id: 'about', href: '/about' }];

// Lazy load bg animation
const BgAnimation = lazy(() => import('~/modules/common/bg-animation'));

const AuthPage = () => {
  const { hasStarted, hasWaited } = useMounted();

  return (
    <div
      data-started={hasStarted}
      data-waited={hasWaited}
      className="group container rich-gradient before:fixed after:fixed flex flex-col min-h-[90vh] sm:min-h-screen items-center"
    >
      {/* Render bg animation */}
      <Suspense fallback={<div className="fixed left-0 top-0 w-full h-full bg-loading-placeholder" />}>
        <div className="fixed left-0 top-0 w-full h-full duration-1000 delay-1000 transition-opacity group-data-[waited=false]:opacity-0 group-data-[waited=true]:opacity-100">
          <BgAnimation />
        </div>
      </Suspense>

      <div className="mt-auto mb-auto">
        <div className="mx-auto mb-40 mt-8 flex flex-col justify-center gap-4 w-72 sm:w-96 transition-all will-change-transform duration-500 ease-out opacity-0 group-data-[started=false]:scale-95 translate-y-4 group-data-[started=true]:opacity-100">
          <Outlet />

          <Link to="/about" className="hover:opacity-90 p-4 active:scale-95 mx-auto ">
            <Logo height={34} />
          </Link>

          <FooterLinks className="max-sm:hidden justify-center" links={authFooterLinks} />
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
