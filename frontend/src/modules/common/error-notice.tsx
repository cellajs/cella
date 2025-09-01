import { SearchParamError, useRouterState } from '@tanstack/react-router';
import i18n from 'i18next';
import { ChevronUp, Home, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '~/lib/api';
import { AppFooter } from '~/modules/common/app/footer';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';

export type ErrorNoticeError = ApiError | Error | null;

interface ErrorNoticeProps {
  error?: ErrorNoticeError;
  resetErrorBoundary?: () => void;
  level: 'root' | 'app' | 'public';
}

export const handleAskForHelp = (ref: RefObject<HTMLButtonElement | null>) => {
  if (!window.Gleap) {
    return contactFormHandler(ref);
  }
  window.Gleap.openConversations();
};

export const getErrorTitle = (error?: ErrorNoticeError, errorFromQuery?: string): string => {
  if (errorFromQuery) return i18n.t(`error:${errorFromQuery}`);

  if (!error) return i18n.t('error:error');

  if (error instanceof SearchParamError) return i18n.t('error:invalid_param');

  if (error instanceof ApiError) {
    const { type, entityType, name } = error;
    if (entityType && type) return i18n.t(`error:resource_${type}`, { resource: i18n.t(entityType) });

    if (type) return i18n.t(`error:${type}`);
    if (name) return name;
  }

  if (error.name) return error.name;

  // Fallback if none of the above matched
  return i18n.t('error:error');
};

export const getErrorText = (error?: ErrorNoticeError, errorFromQuery?: string) => {
  if (errorFromQuery) return i18n.t(`error:${errorFromQuery}.text`);
  if (!error) return i18n.t('error:reported_try_or_contact');

  if (error instanceof SearchParamError) return i18n.t('error:invalid_param.text');

  if (error instanceof ApiError) {
    const { severity, type, entityType, message } = error;
    // Check if the error has an entityType
    if (entityType && type) return i18n.t(`error:resource_${type}.text`, { resource: entityType });
    // If no entityType, check if error has a type
    if (type) return i18n.t(`error:${type}.text`);

    if (severity === 'info') return message;
  }
  if (error.message) return error.message;
  return i18n.t('error:reported_try_or_contact');
};

/**
 * Error can be shown in multiple levels
 *
 * root: no footer can be shown because services are not available
 * app: no footer required
 * public: show footer
 */
const ErrorNotice = ({ error, resetErrorBoundary, level }: ErrorNoticeProps) => {
  const { t } = useTranslation();
  const { location } = useRouterState();

  const contactButtonRef = useRef(null);

  const { error: errorFromQuery, severity: severityFromQuery } = location.search;

  const dateNow = new Date().toUTCString();
  const severity = error && 'severity' in error ? error.severity : severityFromQuery;

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
      <div className="container flex flex-col min-h-[calc(100vh-10rem)] items-center">
        <div className="mt-auto mb-auto">
          <Card className="max-w-[80vw] sm:max-w-[36rem] m-4">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl mb-2 justify-center">{getErrorTitle(error, errorFromQuery)}</CardTitle>
              <CardDescription className="text-foreground/80 text-lg flex-col gap-2">
                <span className="block">{getErrorText(error, errorFromQuery)}</span>
                <span className="block">{severity === 'warn' && t('error:contact_mistake')}</span>
                <span className="block">{severity === 'error' && t('error:try_again_later')}</span>
              </CardDescription>
            </CardHeader>
            {error && 'status' in error && (
              <CardContent className="whitespace-pre-wrap text-red-600 font-mono pb-4">
                {error.type && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setShowError((prev) => !prev)}
                    className="whitespace-pre-wrap w-full text-red-600 flex items-center"
                  >
                    <span>{showError ? t('common:hide_details') : t('common:show_details')}</span>
                    {<ChevronUp size={16} className={`ml-2 transition-transform ${showError ? 'rotate-0' : 'rotate-180'}`} />}
                  </Button>
                )}

                <AnimatePresence>
                  {showError && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-1 grid-cols-[1fr_1fr] text-sm place-items-start pb-4">
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
                        <div>{error.userId || 'na'}</div>
                        <div className="font-medium pr-4 place-self-end">Organization ID</div>
                        <div>{error.organizationId || 'na'}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            )}
            <CardFooter className="flex gap-2 max-sm:flex-col max-sm:items-stretch flex-wrap mt-4 justify-center">
              <Button onClick={handleGoToHome} variant="secondary">
                <Home size={16} className="mr-2" />
                {t('common:home')}
              </Button>
              {!location.pathname.startsWith('/error') && severity !== 'info' && (
                <Button onClick={handleReload}>
                  <RefreshCw size={16} className="mr-2" />
                  {t('common:reload')}
                </Button>
              )}
              {severity && ['warn', 'error'].includes(severity) && (
                <Button ref={contactButtonRef} variant="plain" onClick={() => handleAskForHelp(contactButtonRef)}>
                  <MessageCircleQuestion size={16} className="mr-2" />
                  {t('common:contact_support')}
                </Button>
              )}
            </CardFooter>
          </Card>
          {level !== 'app' && <AppFooter className="items-center mt-10" />}
        </div>
      </div>
    </>
  );
};

export default ErrorNotice;
