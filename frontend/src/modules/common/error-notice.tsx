import { SearchParamError, useRouterState } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { ChevronDown, Home, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '~/lib/api';
import { Dialoger } from '~/modules/common/dialoger';
import { MainFooter } from '~/modules/common/main-footer';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { contactFormHandler } from './contact-form/contact-form-handler';

export type ErrorNoticeError = ApiError | Error | null;

interface ErrorNoticeProps {
  error?: ErrorNoticeError;
  resetErrorBoundary?: () => void;
  level: 'root' | 'app' | 'public';
}

export const handleAskForHelp = () => {
  if (!window.Gleap) {
    return contactFormHandler();
  }
  window.Gleap.openConversations();
};

export const getErrorTitle = (t: TFunction, error?: ErrorNoticeError, errorFromQuery?: string) => {
  if (errorFromQuery) return t(`error:${errorFromQuery}`);
  if (!error) return;

  if (error instanceof SearchParamError) return t('error:invalid_param');

  if ('status' in error) {
    if (error.entityType) return t(`error:resource_${error.type}`, { resource: t(error.entityType) });
    if (error.type) return t(`error:${error.type}`);
    if (error.message) return error.message;
  }

  if (error.name) return error.name;
};

export const getErrorText = (t: TFunction, error?: ErrorNoticeError, errorFromQuery?: string) => {
  if (errorFromQuery) return t(`error:${errorFromQuery}.text`);
  if (!error) return;

  if (error instanceof SearchParamError) return t('error:invalid_param.text');

  if ('status' in error) {
    // Check if the error has an entityType
    if (error.entityType) return t(`error:resource_${error.type}.text`, { resource: error.entityType });
    // If no entityType, check if error has a type
    if (error.type) return t(`error:${error.type}.text`);
    if (error.message) return error.message;
  }
};

// Error can be shown in multiple levels
// - root: no footer can be shown because services are not available
// - app: no footer required
// - public: show footer
const ErrorNotice: React.FC<ErrorNoticeProps> = ({ error, resetErrorBoundary, level }) => {
  const { t } = useTranslation();
  const { location } = useRouterState();
  const { error: errorFromQuery, severity: severityFromQuery } = location.search;

  const dateNow = new Date().toUTCString();
  const severity = error && 'status' in error ? error.severity : severityFromQuery;

  const [showError, setShowError] = useState(false);

  const handleReload = () => {
    resetErrorBoundary?.();
    window.location.reload();
  };

  const handleGoToHome = () => {
    resetErrorBoundary?.();
    window.location.replace('/');
  };

  return (
    <>
      {level === 'root' && <Dialoger />}
      <div className="container flex flex-col min-h-[calc(100vh-20rem)] items-center">
        <div className="mt-auto mb-auto">
          <Card className="max-w-[36rem] m-4">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl mb-2">{getErrorTitle(t, error, errorFromQuery) || t('error:error')}</CardTitle>
              <CardDescription className="text-base">
                <span>{getErrorText(t, error, errorFromQuery) || t('error:reported_try_or_contact')}</span>
                <span className="ml-1">{severity === 'warn' && t('error:contact_mistake')}</span>
                <span className="ml-1">{severity === 'error' && t('error:try_again_later')}</span>
              </CardDescription>
            </CardHeader>
            {error && 'status' in error && (
              <CardContent className="whitespace-pre-wrap text-red-600 font-mono">
                {error.type && !showError && (
                  <Button variant="link" size="sm" onClick={() => setShowError(true)} className="whitespace-pre-wrap w-full text-red-600">
                    <span>{t('error:show_details')}</span>
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
                    <div>{error.entityType || 'na'}</div>
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
              {severity && ['warn', 'error'].includes(severity) && (
                <Button variant="plain" onClick={handleAskForHelp}>
                  <MessageCircleQuestion size={16} className="mr-1" />
                  {t('common:ask_for_help')}
                </Button>
              )}
            </CardFooter>
          </Card>
          {level !== 'app' && <MainFooter className="items-center mt-10" />}
        </div>
      </div>
    </>
  );
};

export default ErrorNotice;
