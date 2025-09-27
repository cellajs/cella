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

/**
 * Returns a locale key string based on the error type or query.
 */
const getErrorLocaleKey = (error?: ErrorNoticeError, errorFromQuery?: string): string => {
  if (errorFromQuery) return errorFromQuery;
  if (!error) return 'error';

  if (error instanceof SearchParamError) return 'invalid_param';

  if (error instanceof ApiError) return error.entityType && error.type ? `resource_${error.type}` : error.type || error.name;

  return error.name;
};

/**
 * Returns localized error info (title and message) for a given error.
 */
export const getErrorInfo = (error?: ErrorNoticeError, errorFromQuery?: string) => {
  const localeKey = getErrorLocaleKey(error, errorFromQuery);

  const translationOptions = {
    ns: ['appError', 'error'],
    ...(error instanceof ApiError && error.entityType
      ? { resource: i18n.t(error.entityType), resourceLowerCase: i18n.t(error.entityType).toLowerCase() }
      : {}),
  };

  const defaultTitle = error?.name || i18n.t('error:error');
  const defaultMessage = error?.message || '';

  // Title translation
  const title = i18n.t(localeKey, { ...translationOptions, defaultValue: defaultTitle });

  // Message translation with severity check (type-safe)
  const message =
    error && 'severity' in error && error.severity === 'info'
      ? error.message
      : i18n.t(`${localeKey}.text`, { ...translationOptions, defaultValue: defaultMessage });

  return { title, message };
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
  const contactButtonRef = useRef<HTMLButtonElement>(null);
  const { error: errorFromQuery, severity: severityFromQuery } = location.search;

  const [showError, setShowError] = useState(false);
  const severity = error && 'severity' in error ? error.severity : severityFromQuery;

  const { title, message } = getErrorInfo(error, errorFromQuery);

  const dateNow = new Date().toUTCString();

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
              <CardTitle className="text-2xl mb-2 justify-center">{title}</CardTitle>
              <CardDescription className="text-foreground/80 text-lg flex-col gap-2">
                <span className="block">{message}</span>
                <span className="block mt-2 font-light">
                  <span className="block">{severity === 'warn' && t('error:contact_mistake')}</span>
                  <span className="block">{severity === 'error' && t('error:try_again_later')}</span>
                </span>
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
            <CardFooter className="flex gap-2 max-sm:flex-col max-sm:items-stretch flex-wrap mt-8 justify-center">
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
