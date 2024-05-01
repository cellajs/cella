import { useRouterState } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { ChevronDown, Home, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AppFooter } from '~/modules/common/app-footer';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';

interface ErrorNoticeProps {
  error?: ErrorType;
  resetErrorBoundary?: () => void;
  isRootLevel?: boolean;
}

const ErrorNotice: React.FC<ErrorNoticeProps> = ({ error, resetErrorBoundary, isRootLevel }) => {
  const { t } = useTranslation();
  const { location } = useRouterState();
  const dateNow = new Date().toUTCString();

  const [showError, setShowError] = useState(false);

  const handleReload = () => {
    if (resetErrorBoundary) resetErrorBoundary();
    window.location.reload();
  };

  const handleGoToHome = () => {
    if (resetErrorBoundary) resetErrorBoundary();
    window.location.replace('/');
  };

  const handleAskForHelp = () => {
    if (!window.Gleap) return toast.error(t('common:error.gleap_not_initialized'));
    window.Gleap.openConversations();
  };

  return (
    <div className="container flex flex-col min-h-screen items-center">
      <div className="mt-auto mb-auto">
        <Card className="max-w-[36rem] m-4">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl mb-2">
              {error?.resourceType
                ? t(`common:error.resource_${error.type}`, { resource: t(error.resourceType.toLowerCase()) })
                : error?.type
                  ? t(`common:error.${error.type}`)
                  : error?.message || t('common:error.error')}
            </CardTitle>
            <CardDescription>
              <span>
                {error?.resourceType
                  ? t(`common:error.resource_${error.type}.text`, { resource: t(error.resourceType.toLowerCase()) })
                  : error?.type
                    ? t(`common:error.${error.type}.text`)
                    : error?.message || t('common:error.reported_try_or_contact')}
              </span>
              <span className="ml-1">{error?.severity && error.severity === 'warn' && t('common:error.contact_mistake')}</span>
              <span className="ml-1">{error?.severity && error.severity === 'error' && t('common:error.try_again_later')}</span>
            </CardDescription>
          </CardHeader>
          {error && (
            <CardContent className="text-center whitespace-pre-wrap text-red-600 font-mono">
              {error.type && !showError && (
                <Button variant="link" size="sm" onClick={() => setShowError(true)} className="whitespace-pre-wrap text-red-600">
                  <span>{t('common:error.show_details')}</span>
                  <ChevronDown size={12} className="ml-1" />
                </Button>
              )}
              {error.type && showError && (
                <div className="grid gap-1 grid-cols-[1fr_1fr] text-sm place-items-start">
                  <div className="font-medium pr-4 place-self-end">Log ID</div>
                  <div>{error.logId || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">Timestamp</div>
                  <div>{dateNow}</div>
                  <div className="font-medium pr-4 place-self-end">Message</div>
                  <div>{error.message || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">Type</div>
                  <div>{error.type || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">Resource type</div>
                  <div>{error.resourceType || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">HTTP status</div>
                  <div>{error.status || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">Severity</div>
                  <div>{error.severity || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">User ID</div>
                  <div>{error.usr || 'na'}</div>
                  <div className="font-medium pr-4 place-self-end">Organization ID</div>
                  <div>{error.org || 'na'}</div>
                </div>
              )}
            </CardContent>
          )}
          <CardFooter className="flex gap-2 mt-4 justify-center">
            <Button onClick={handleGoToHome} variant="secondary">
              <Home size={16} className="mr-1" />
              {t('common:home')}
            </Button>
            {!location.pathname.startsWith('/error') && (
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
          </CardFooter>
        </Card>
        {isRootLevel && <AppFooter />}
      </div>
    </div>
  );
};

export default ErrorNotice;
