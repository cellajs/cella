import { useRouterState } from '@tanstack/react-router';
import config from 'config';
import { Home, RefreshCw } from 'lucide-react';
import React from 'react';
import { AppFooter } from '~/components/app-footer';
import { Button } from '~/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';

interface ErrorPageProps {
  error?: Error;
}

const ErrorPage: React.FC<ErrorPageProps> = ({ error }) => {
  const { location } = useRouterState();

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoToHome = () => {
    window.location.replace('/');
  };

  return (
    <div className="container flex flex-col min-h-svh items-center">
      <div className="mt-auto mb-auto">
        <Card className="max-w-[32rem] m-4">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl">Error</CardTitle>
            <CardDescription>The error has been reported. Please try again later and contact us if the problem persists.</CardDescription>
          </CardHeader>
          <div className="p-4 text-center">
            <pre className="whitespace-pre-wrap text-sm text-red-600">{error?.message || 'Error details not available'}</pre>
          </div>
          <CardFooter className="flex justify-center">
            {!location.pathname.startsWith('/error') && (
              <Button onClick={handleReload}>
                <RefreshCw size={20} className="mr-2" strokeWidth={config.theme.strokeWidth} />
                Reload
              </Button>
            )}
            <Button className="ml-4" onClick={handleGoToHome} variant="secondary">
              <Home size={20} className="mr-2" strokeWidth={config.theme.strokeWidth} />
              Go to home
            </Button>
          </CardFooter>
        </Card>
        <AppFooter />
      </div>
    </div>
  );
};

export default ErrorPage;
