import { useRouterState } from '@tanstack/react-router';
import { ChevronUpIcon, HomeIcon, MessageCircleQuestionIcon, RefreshCwIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppFooter } from '~/modules/common/app/app-footer';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { type ErrorNoticeError, getErrorInfo, handleAskForHelp } from '~/modules/common/error-helpers';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import router from '~/routes/router';
import type { BoundaryType } from '~/routes/types';

export type { ErrorNoticeError } from '~/modules/common/error-helpers';

interface ErrorNoticeProps {
  boundary: BoundaryType;
  error?: ErrorNoticeError;
  children?: React.ReactNode;
  resetErrorBoundary?: () => void;
  homePath?: string;
}

/**
 * Error can be shown in multiple levels
 *
 * root: no footer can be shown because services are not available
 * app: no footer required
 * public: show footer
 */
export function ErrorNotice({ error, children, resetErrorBoundary, boundary, homePath = '/' }: ErrorNoticeProps) {
  const { t } = useTranslation();
  const { location } = useRouterState();
  const contactButtonRef = useRef<HTMLButtonElement>(null);

  const { error: errorFromQuery, severity: severityFromQuery } = location.search;

  const [showError, setShowError] = useState(false);
  const severity = error && 'severity' in error ? error.severity : severityFromQuery;

  const { title, message } = getErrorInfo({ error, errorFromQuery });

  const dateNow = new Date().toUTCString();

  // Reset before route change to prevent retaining the error state
  useEffect(() => {
    const unsub = router.subscribe('onBeforeRouteMount', () => {
      resetErrorBoundary?.();
    });
    return unsub;
  }, [router, resetErrorBoundary]);

  const handleReload = () => {
    resetErrorBoundary?.();
    window.location.reload();
  };

  const handleGoToHome = () => {
    resetErrorBoundary?.();
    window.location.replace(homePath);
  };

  return (
    <>
      {boundary === 'root' && <Dialoger />}
      <div className="error-notice container flex min-h-[calc(100vh-10rem)] flex-col items-center">
        <div className="mx-auto my-auto">
          <Card className="mt-8 w-[80vw] max-w-[80vw] border-none bg-transparent sm:w-160">
            <CardHeader className="p-0 text-center">
              <CardTitle className="mb-2 justify-center font-normal text-2xl">{title}</CardTitle>
              <CardDescription className="flex-col gap-2 p-0 text-base text-foreground">
                <span className="block">{message}</span>
                <span className="mt-2 block">
                  <span className="block">{severity === 'warn' && t('error:contact_mistake')}</span>
                  <span className="block">{severity === 'error' && t('error:try_again_later')}</span>
                </span>
              </CardDescription>
            </CardHeader>
            {error && 'status' in error && (
              <CardContent className="whitespace-pre-wrap px-0 py-4 font-mono text-red-600">
                {error.type && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setShowError((prev) => !prev)}
                    className="flex w-full items-center whitespace-pre-wrap text-red-600"
                  >
                    <span>{showError ? t('c:hide_details') : t('c:show_details')}</span>
                    {
                      <ChevronUpIcon
                        size={16}
                        className={`ml-2 transition-transform ${showError ? 'rotate-0' : 'rotate-180'}`}
                      />
                    }
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
                      <div className="grid grid-cols-[auto_1fr] place-items-start gap-1 pb-4 text-sm">
                        <div className="place-self-end pr-4 font-medium">Log ID</div>
                        <div>{error.logId || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">Timestamp</div>
                        <div>{dateNow}</div>
                        <div className="place-self-end pr-4 font-medium">Message</div>
                        <div>{error.message || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">Type</div>
                        <div>{error.type || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">Resource type</div>
                        <div>{error.entityType || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">HTTP status</div>
                        <div>{error.status || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">Severity</div>
                        <div>{error.severity || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">User ID</div>
                        <div>{error.userId || 'na'}</div>
                        <div className="place-self-end pr-4 font-medium">Organization ID</div>
                        <div>{error.organizationId || 'na'}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            )}
            <CardFooter className="mt-8 flex flex-wrap justify-center gap-2 p-0 max-sm:flex-col max-sm:items-stretch">
              {children ? (
                children
              ) : (
                <>
                  <Button onClick={handleGoToHome} variant="secondary">
                    <HomeIcon size={16} className="mr-2" />
                    {t('c:home')}
                  </Button>
                  {!location.pathname.endsWith('/error') && severity !== 'info' && (
                    <Button onClick={handleReload}>
                      <RefreshCwIcon size={16} className="mr-2" />
                      {t('c:reload')}
                    </Button>
                  )}
                </>
              )}
              {severity && ['warn', 'error'].includes(severity) && (
                <Button ref={contactButtonRef} variant="plain" onClick={() => handleAskForHelp(contactButtonRef)}>
                  <MessageCircleQuestionIcon size={16} className="mr-2" />
                  {t('c:contact_support')}
                </Button>
              )}
            </CardFooter>
          </Card>
          {boundary !== 'app' && <AppFooter className="mt-10 items-center" />}
        </div>
      </div>
    </>
  );
}
