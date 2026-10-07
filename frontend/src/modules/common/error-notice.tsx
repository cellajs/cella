import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { BuildingIcon, ChevronUpIcon, HouseIcon, MessageCircleQuestionMarkIcon, RefreshCwIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '~/lib/api';
import { AppFooter } from '~/modules/common/app/app-footer';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { handleAskForHelp } from '~/modules/common/error-helpers';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import type { BoundaryType } from '~/routes/types';
import { cn } from '~/utils/cn';
import { type ErrorNoticeError, getErrorInfo } from '~/utils/get-error-info';

export type { ErrorNoticeError } from '~/utils/get-error-info';

interface ErrorNoticeProps {
  boundary: BoundaryType;
  error?: ErrorNoticeError;
  children?: React.ReactNode;
  resetErrorBoundary?: () => void;
  homePath?: string;
}

/**
 * `boundary` names the layout still standing around the notice, and so what the notice brings itself: root (none:
 * the overlay hosts and the footer), public (the public layout: the footer), app (the app layout: nothing).
 * Without an `error`, the route's `error` and `severity` search params name it.
 */
export function ErrorNotice({ error, children, resetErrorBoundary, boundary, homePath = '/' }: ErrorNoticeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const errorFromQuery = useRouterState({ select: (s) => s.location.search.error });
  const severityFromQuery = useRouterState({ select: (s) => s.location.search.severity });
  const contactButtonRef = useRef<HTMLButtonElement>(null);

  const [showError, setShowError] = useState(false);

  // Only an API error carries a severity, request details and a connection to sign in through
  const apiError = error instanceof ApiError ? error : undefined;
  const severity = error ? apiError?.severity : severityFromQuery;
  const { title, message } = getErrorInfo({ error, errorFromQuery });

  // A tenant that requires signing in through an institution names the connection; its entry page takes it from here.
  const ssoConnectionId = apiError?.type === 'sso_required' ? apiError.meta?.connectionId : undefined;

  // Reset before a route change so the error state is not retained
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
      {/* At the root no layout is left to host what the notice and its footer open */}
      {boundary === 'root' && (
        <>
          <Dialoger />
          <Dropdowner />
        </>
      )}
      <div className="error-notice container flex min-h-[calc(100svh-10rem)] flex-col items-center">
        <div className="mx-auto my-auto">
          <Card className="mt-8 w-[80vw] max-w-[80vw] border-none bg-transparent sm:w-160">
            <CardHeader className="p-0 text-center">
              <CardTitle level={1} className="mb-2 justify-center font-normal text-2xl">
                {title}
              </CardTitle>
              <CardDescription className="flex-col gap-2 p-0 text-base text-foreground">
                <span className="block">{message}</span>
                <span className="mt-2 block">
                  <span className="block">{severity === 'warn' && t('error:contact_mistake')}</span>
                  <span className="block">{severity === 'error' && t('error:try_again_later')}</span>
                </span>
              </CardDescription>
            </CardHeader>
            {apiError?.type && (
              <CardContent className="whitespace-pre-wrap px-0 py-4 font-mono text-destructive">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setShowError((prev) => !prev)}
                  className="flex w-full items-center whitespace-pre-wrap text-destructive"
                >
                  <span>{showError ? t('c:hide_details') : t('c:show_details')}</span>
                  <ChevronUpIcon className={cn('transition-transform', showError ? 'rotate-0' : 'rotate-180')} />
                </Button>

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
                        {(
                          [
                            ['c:request_id', apiError.requestId],
                            // A server error carries the moment it was raised; one made in the browser shows the time it renders.
                            ['c:timestamp', new Date(apiError.timestamp ?? Date.now()).toUTCString()],
                            ['c:message', apiError.message],
                            ['c:type', apiError.type],
                            ['c:resource_type', apiError.entityType],
                            ['c:http_status', apiError.status],
                            ['c:severity', apiError.severity],
                            ['c:user_id', apiError.userId],
                            ['c:organization_id', apiError.organizationId],
                          ] as const
                        ).map(([label, value]) => (
                          <Fragment key={label}>
                            <div className="place-self-end pr-4 font-medium">{t(label)}</div>
                            <div>{value || 'na'}</div>
                          </Fragment>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            )}
            <CardFooter className="mt-8 flex flex-wrap justify-center gap-2 p-0 max-sm:flex-col max-sm:items-stretch">
              {typeof ssoConnectionId === 'string' && (
                <Button
                  render={<Link to="/auth/sso/$connectionId" params={{ connectionId: ssoConnectionId }} search={{ redirect: location.pathname }} />}
                >
                  <BuildingIcon />
                  {t('c:sign_in_with_your_institution')}
                </Button>
              )}
              {children ? (
                children
              ) : (
                <>
                  <Button onClick={handleGoToHome} variant="secondary">
                    <HouseIcon />
                    {t('c:home')}
                  </Button>
                  {!location.pathname.endsWith('/error') && severity !== 'info' && (
                    <Button onClick={handleReload}>
                      <RefreshCwIcon />
                      {t('c:reload')}
                    </Button>
                  )}
                </>
              )}
              {severity && ['warn', 'error'].includes(severity) && (
                <Button ref={contactButtonRef} variant="plain" onClick={() => handleAskForHelp(contactButtonRef)}>
                  <MessageCircleQuestionMarkIcon />
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
