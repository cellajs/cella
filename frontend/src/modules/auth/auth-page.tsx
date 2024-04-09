import { Link } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { type FooterLinkProps, FooterLinks } from '~/modules/common/app-footer';
import Logo from '~/modules/common/logo';
import useMountedState from '~/hooks/use-mounted';
import { cn } from '~/lib/utils';

interface AuthPageProps {
  children?: React.ReactNode;
}

// Auth footer links
const authFooterLinks: FooterLinkProps[] = [{ id: 'about', href: '/about' }];

// Lazy load bg animation
const BgAnimation = lazy(() => import('~/modules/common/bg-animation'));

const AuthPage = ({ children }: AuthPageProps) => {
  const { hasStarted, hasWaited } = useMountedState();
  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-1' : 'opacity-0 scale-95 translate-y-4'}`;

  return (
    <div className="container rich-gradient before:fixed after:fixed flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      {/* Render bg animation */}
      <Suspense fallback={null}>
        <div className={`absolute left-0 top-0 w-full h-full duration-1000 transition-opacity ${hasWaited ? 'opacity-100' : 'opacity-0'}`}>
          <BgAnimation />
        </div>
      </Suspense>

      <div className="mt-auto mb-auto">
        <div className={cn('mx-auto mb-40 mt-8 flex flex-col justify-center gap-4 w-[280px] sm:w-[360px]', animateClass)}>
          {children}

          <Link to="/about" className="hover:opacity-90 p-4 active:scale-95">
            <Logo height={34} />
          </Link>

          <FooterLinks className="max-md:hidden scale-110" links={authFooterLinks} />
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
