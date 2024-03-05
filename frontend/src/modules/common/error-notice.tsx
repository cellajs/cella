import { useRouterState } from '@tanstack/react-router';
import { Home, RefreshCw } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppFooter } from '~/modules/common/app-footer';
import { Button } from '~/modules/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';

interface ErrorNoticeProps {
  error?: Error;
}

const ErrorNotice: React.FC<ErrorNoticeProps> = ({ error }) => {
  const { t } = useTranslation();
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
            <CardTitle className="text-4xl">{t('common:error.error')}</CardTitle>
            <CardDescription>{t('common:error.reported_try_or_contact')}</CardDescription>
          </CardHeader>
          <div className="p-4 text-center">
            <pre className="whitespace-pre-wrap text-sm text-red-600">{error?.message || t('common:error.reported')}</pre>
          </div>
          <CardFooter className="flex justify-center">
            {!location.pathname.startsWith('/error') && (
              <Button onClick={handleReload}>
                <RefreshCw size={16} className="mr-1" />
                {t('common:reload')}
              </Button>
            )}
            <Button className="ml-4" onClick={handleGoToHome} variant="secondary">
              <Home size={16} className="mr-1" />
              {t('common:home')}
            </Button>
          </CardFooter>
        </Card>
        <AppFooter />
      </div>
    </div>
  );
};

export default ErrorNotice;
