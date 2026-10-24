import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { BuildingIcon, ChevronUpIcon, HouseIcon, MessageCircleQuestionMarkIcon, RefreshCwIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { ApiError } from '~/lib/api';
import { AppFooter } from '~/modules/common/app/app-footer';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { askForHelp } from '~/modules/common/error-helpers';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import type { BoundaryType } from '~/routes/types';
import { reloadApp } from '~/utils/app-update';
import { cn } from '~/utils/cn';
import { getErrorInfo } from '~/utils/get-error-info';

interface ErrorNoticeProps {
  boundary: BoundaryType;
  /** Any thrown value, as error boundaries hand it over; one that is no `Error` reads as none. */
  error?: unknown;
  children?: ReactNode;
  resetErrorBoundary?: () => void;
  homePath?: string;
}

function errorDetailRows(error: ApiError) {
  return [
    ['c:request_id', error.requestId],
    // A server error carries the moment it was raised; one made in the browser shows the time it renders.
    ['c:timestamp', new Date(error.timestamp ?? Date.now()).toUTCString()],
    ['c:message', error.message],
    ['c:type', error.type],
    ['c:resource_type', error.entityType],
    ['c:http_status', error.status],
    ['c:severity', error.severity],
    ['c:user_id', error.userId],
    ['c:organization_id', error.organizationId],
    // The server's full SHA cut to the page's short one, so a rollout mismatch reads at a glance
    ['c:server_version', error.version?.slice(0, __APP_VERSION__.length)],
    ['c:app_version', __APP_VERSION__],
  ] as const;
}

/**
 * `boundary` names the layout still standing around the notice, and so what the notice brings itself: root (none:
 * the overlay hosts and the footer), public (the public layout: the footer), app (the app layout: nothing).
 * Without an `error`, the route's `error` and `severity` search params name it.
 */
export function ErrorNotice({ error, children, resetErrorBoundary, boundary, homePath = '/' }: ErrorNoticeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const errorFromQuery = useRouterState({ select: (state) => state.location.search.error });
  const severityFromQuery = useRouterState({ select: (state) => state.location.search.severity });
  const contactButtonRef = useRef<HTMLButtonElement>(null);

  const [showDetails, setShowDetails] = useState(false);

  const knownError = error instanceof Error ? error : undefined;
  // Only an API error carries a severity, request details and a connection to sign in through
  const apiError = knownError instanceof ApiError ? knownError : undefined;
  const severity = knownError ? apiError?.severity : severityFromQuery;
  const { title, message } = getErrorInfo({ error: knownError, errorFromQuery });

  // A tenant that requires signing in through an institution names the connection; its entry page takes it from here.
  const ssoConnectionId = apiError?.type === 'sso_required' ? apiError.meta?.connectionId : undefined;

  // Reset before a route change so the error state is not retained
  useEffect(() => router.subscribe('onBeforeRouteMount', () => resetErrorBoundary?.()), [router, resetErrorBoundary]);

  // No boundary reset: the reload can wait on a worker handover, and a reset would rerun the failed route meanwhile
  const handleReload = () => void reloadApp();

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
            <CardHeader className="px-0 text-center">
              <CardTitle level={1} className="mb-2 justify-center font-normal text-2xl">
                {title}
              </CardTitle>
              <CardDescription className="text-base text-foreground">
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
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="flex w-full whitespace-pre-wrap text-destructive"
                >
                  <span>{showDetails ? t('c:hide_details') : t('c:show_details')}</span>
                  <ChevronUpIcon className={cn('transition-transform', !showDetails && 'rotate-180')} />
                </Button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div {...collapseMotion} className="overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr] place-items-start gap-1 pb-4 text-sm">
                        {errorDetailRows(apiError).map(([label, value]) => (
                          <Fragment key={label}>
                            <div className="place-self-end pr-4 font-medium">{t(label)}</div>
                            <div>{value || '-'}</div>
                          </Fragment>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            )}
            <CardFooter className="mt-8 flex-wrap justify-center gap-2 px-0 max-sm:flex-col max-sm:items-stretch">
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
                <Button ref={contactButtonRef} variant="plain" onClick={() => askForHelp(contactButtonRef)}>
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

/** The `fallbackRender` of an error boundary inside the `boundary` layout. */
export function errorNoticeFallback(boundary: BoundaryType) {
  return ({ error, resetErrorBoundary }: FallbackProps) => <ErrorNotice boundary={boundary} error={error} resetErrorBoundary={resetErrorBoundary} />;
}
