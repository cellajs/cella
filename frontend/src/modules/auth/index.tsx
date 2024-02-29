import { Link } from '@tanstack/react-router';
import Logo from '~/modules/common/logo';

interface AuthPageProps {
  children: React.ReactNode;
}

const AuthPage = ({ children }: AuthPageProps) => {
  return (
    <div className="container rich-gradient before:fixed after:fixed flex flex-col min-h-[90vh] sm:min-h-svh items-center">
      <div className="mt-auto mb-auto">
        <div className="mx-auto mb-40 mt-8 flex flex-col justify-center space-y-4 w-[280px] sm:w-[360px]">
          {children}

          <Link to="/about" className="hover:opacity-90 !mt-8 mb-4 active:scale-95">
            <Logo height={30} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
