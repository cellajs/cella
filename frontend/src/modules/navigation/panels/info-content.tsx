import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpenIcon, ExternalLinkIcon, InfoIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { askForHelp } from '~/modules/common/error-helpers';
import { StatusDot, type StatusDotVariant } from '~/modules/common/status-dot';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { type HealthStatus, healthQueryOptions } from '~/modules/navigation/panels/query';
import { type GradedStatusEntry, gradeStatusEntries, worstStatus } from '~/modules/navigation/panels/status-entries';
import { Button } from '~/modules/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const statusVariant: Record<HealthStatus, StatusDotVariant> = { healthy: 'success', degraded: 'warning', unhealthy: 'destructive' };

// Same box as a NavSheetRow, with the dot in its 16px icon column, so dots and labels line up with the rows above
const statusCardClass = tw('flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-xs');

/** One status entry; hover or focus shows what it covers and, when not healthy, which check failed and why. */
function StatusEntryCard({ graded: { entry, status, component, reason } }: { graded: GradedStatusEntry }) {
  const { t } = useTranslation();

  return (
    <HoverCard>
      <HoverCardTrigger render={<button type="button" />} className={cn(statusCardClass, 'focus-effect')}>
        <StatusDot variant={statusVariant[status]} className="mx-1" />
        <span className="min-w-0">{t(entry.label)}</span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="flex w-60 flex-col gap-1 p-3">
        <p className="font-medium">{t(entry.label)}</p>
        <p className="text-muted-foreground text-xs">{t(entry.description)}</p>
        {status !== 'healthy' && (
          <p className="mt-1 flex items-center gap-2 text-xs">
            <StatusDot variant={statusVariant[status]} />
            {t(`c:${status}`)}
            {component && <span className="truncate font-mono text-muted-foreground">{reason ? `${component}: ${reason}` : component}</span>}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/** A dot after the closed info panel's label while a service is degraded or unhealthy, in that status's color. */
export function InfoIndicator() {
  const { t } = useTranslation();
  // Checks when the sheet opens and the last result is older than the poll interval; only the open panel polls
  const { data: health } = useQuery({ ...healthQueryOptions(), refetchInterval: false });

  const status = health === undefined ? 'healthy' : worstStatus(gradeStatusEntries(health));
  if (status === 'healthy') return null;
  return <StatusDot variant={statusVariant[status]} label={t(`c:${status}`)} />;
}

export function InfoContent() {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement>(null);
  const contactRef = useRef<HTMLButtonElement>(null);
  const { data: health } = useSuspenseQuery(healthQueryOptions());
  const statusEntries = gradeStatusEntries(health);
  const allHealthy = statusEntries.length > 0 && statusEntries.every(({ status }) => status === 'healthy');

  const hasStatusPage = !!appConfig.statusUrl?.trim();

  return (
    <div className="flex flex-col gap-6 pt-3 pb-8">
      <div className="flex flex-col gap-1">
        <h3 className="group-label px-3">{t('c:support')}</h3>
        <NavSheetRow icon={InfoIcon} label={t('c:about')} render={<Link to={appConfig.aboutUrl} />} />
        <NavSheetRow icon={BookOpenIcon} label={t('c:docs')} render={<Link to="/docs" />} />
        {appConfig.has.chatSupport && (
          <NavSheetRow ref={supportRef} icon={LifeBuoyIcon} label={t('c:support')} onClick={() => askForHelp(supportRef)} />
        )}
        <NavSheetRow ref={contactRef} icon={MailIcon} label={t('c:contact_us')} onClick={() => contactFormHandler(contactRef)} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 px-3">
          <h3 className="group-label">{t('c:status')}</h3>
          <div className="flex items-center gap-3">
            <span className="text-faint-foreground text-xs">{__PKG_VERSION__}</span>
            {hasStatusPage && (
              <Button
                variant="link"
                size="auto"
                className="gap-1 text-faint-foreground text-xs hover:text-muted-foreground"
                onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLinkIcon className="size-3" />
                {t('c:details')}
              </Button>
            )}
          </div>
        </div>
        <div className={cn('gap-2 pt-1', allHealthy ? 'flex flex-col' : 'grid grid-cols-2')}>
          {allHealthy ? (
            <div className={statusCardClass}>
              <StatusDot variant="success" className="mx-1" />
              {t('c:all_systems_healthy')}
            </div>
          ) : (
            statusEntries.map((graded) => <StatusEntryCard key={graded.entry.id} graded={graded} />)
          )}
        </div>
      </div>
    </div>
  );
}
