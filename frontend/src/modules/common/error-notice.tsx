import { useRouterState } from '@tanstack/react-router';
import { ErrorType } from 'backend/lib/errors';
import { ChevronDown, Home, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppFooter } from '~/modules/common/app-footer';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';

interface ErrorNoticeProps {
  error?: ErrorType;
}

const ErrorNotice: React.FC<ErrorNoticeProps> = ({ error }) => {
  const { t } = useTranslation();
  const { location } = useRouterState();
  const dateNow = new Date().toUTCString();

  const [showError, setShowError] = useState(false);

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoToHome = () => {
    window.location.replace('/');
  };

  const handleAskForHelp = () => {
    // TODO: Open chat
  };

  return (
    <div className="container flex flex-col min-h-svh items-center">
      <div className="mt-auto mb-auto">
        <Card className="max-w-[32rem] m-4">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl mb-2">{error?.type ? error.message : t('common:error.error')}</CardTitle>
            <CardDescription>
              <span>{error?.type ? t(`common:error.text.${error.type}`) : t('common:error.reported_try_or_contact')}</span>
              <span className="ml-1">{error?.severity && error.severity === 'warn' && t('common:error.contact_mistake')}</span>
              <span className="ml-1">{error?.severity && error.severity === 'error' && t('common:error.try_again_later')}</span>
            </CardDescription>
          </CardHeader>
          {error && (
            <CardContent className="text-center whitespace-pre-wrap text-red-600 font-mono">
              {error.message && !error.type && <p>{error.message}</p>}
              {error.type && !showError && (
                <Button variant="link" size="sm" onClick={() => setShowError(true)} className="whitespace-pre-wrap text-red-600">
                  <span>{t('common:error.show_details')}</span>
                  <ChevronDown size={12} className="ml-1" />
                </Button>
              )}
              {error.type && showError && (
                <div className="grid gap-1 grid-cols-[auto_auto] text-sm">
                  <div className="font-medium pr-4">Log ID</div>
                  <div>{error.logId || 'na'}</div>
                  <div className="font-medium pr-4">Timestamp</div>
                  <div>{dateNow}</div>
                  <div className="font-medium pr-4">Message</div>
                  <div>{error.message || 'na'}</div>
                  <div className="font-medium pr-4">Type</div>
                  <div>{error.type || 'na'}</div>
                  <div className="font-medium pr-4">HTTP status</div>
                  <div>{error.status || 'na'}</div>
                  <div className="font-medium pr-4">Severity</div>
                  <div>{error.severity || 'na'}</div>
                  <div className="font-medium pr-4">User ID</div>
                  <div>{error.usr || 'na'}</div>
                  <div className="font-medium pr-4">Organization ID</div>
                  <div>{error.org || 'na'}</div>
                </div>
              )}
            </CardContent>
          )}
          <CardFooter className="flex mt-4 justify-center">
            {!location.pathname.startsWith('/error') && !error?.message && (
              <Button onClick={handleReload}>
                <RefreshCw size={16} className="mr-1" />
                {t('common:reload')}
              </Button>
            )}
            {error?.severity && ['warn', 'error'].includes(error.severity) && (
              <Button variant="plain" onClick={handleAskForHelp}>
                <MessageCircleQuestion size={16} className="mr-1" />
                {t('common:ask_for_help')}
              </Button>
            )}
            <Button className="ml-2" onClick={handleGoToHome} variant="secondary">
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
