import { Link } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import Logo from '~/modules/common/logo';
import { type FooterLinkProps, FooterLinks } from '~/modules/common/app-footer';

interface AuthPageProps {
  children?: React.ReactNode;
}

// Auth footer links
const authFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
];


// Lazy load bg animation
const BgAnimation = lazy(() => import('~/modules/common/bg-animation'));

const AuthPage = ({ children }: AuthPageProps) => {
  return (
    <div className="container rich-gradient before:fixed after:fixed flex flex-col min-h-[90vh] sm:min-h-svh items-center">

      {/* Render bg animation */}
      <Suspense fallback={null}>
        <BgAnimation />
      </Suspense>

      <div className="mt-auto mb-auto">
        <div className="mx-auto mb-40 mt-8 flex flex-col justify-center space-y-4 w-[280px] sm:w-[360px]">
          {children}

          <Link to="/about" className="hover:opacity-90 !mt-8 active:scale-95">
            <Logo height={30} />
          </Link>

          <FooterLinks className="max-md:hidden !mt-8 scale-110" links={authFooterLinks} />
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
