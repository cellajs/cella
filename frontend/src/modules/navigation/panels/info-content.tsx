import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpenIcon, ExternalLinkIcon, InfoIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { askForHelp } from '~/modules/common/error-helpers';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { PanelHeading } from '~/modules/navigation/panels/panel-heading';
import { type HealthStatus, healthQueryOptions } from '~/modules/navigation/panels/query';
import { type GradedStatusEntry, gradeStatusEntries } from '~/modules/navigation/panels/status-entries';
import { Button } from '~/modules/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const statusStyleMap: Record<HealthStatus, { dot: string; pulse: string }> = {
  healthy: { dot: 'bg-success', pulse: '[--status-pulse-color:color-mix(in_oklch,var(--success)_30%,transparent)]' },
  degraded: { dot: 'bg-warning', pulse: '[--status-pulse-color:color-mix(in_oklch,var(--warning)_30%,transparent)]' },
  unhealthy: { dot: 'bg-destructive', pulse: '[--status-pulse-color:color-mix(in_oklch,var(--destructive)_30%,transparent)]' },
};

const statusCardClass = tw('flex items-center gap-2 rounded-md border border-input border-dashed px-4 py-2 text-left text-xs');

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 animate-status-pulse rounded-full motion-reduce:animate-none',
        statusStyleMap[status].dot,
        statusStyleMap[status].pulse,
      )}
      aria-hidden="true"
    />
  );
}

/** One status entry; hover or focus shows what it covers and, when not healthy, which check failed and why. */
function StatusEntryCard({ graded: { entry, status, component, reason } }: { graded: GradedStatusEntry }) {
  const { t } = useTranslation();

  return (
    <HoverCard>
      <HoverCardTrigger render={<button type="button" />} className={cn(statusCardClass, 'focus-effect border-input')}>
        <StatusDot status={status} />
        <span className="min-w-0">{t(entry.label)}</span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="flex w-60 flex-col gap-1 p-3">
        <p className="font-medium">{t(entry.label)}</p>
        <p className="text-muted-foreground text-xs">{t(entry.description)}</p>
        {status !== 'healthy' && (
          <p className="mt-1 flex items-center gap-2 text-xs">
            <StatusDot status={status} />
            {t(`c:${status}`)}
            {component && <span className="truncate font-mono text-muted-foreground">{reason ? `${component}: ${reason}` : component}</span>}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function InfoContent() {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement>(null);
  const contactRef = useRef<HTMLButtonElement>(null);
  const { data: health, isError, isPending } = useQuery(healthQueryOptions());
  const statusEntries = isPending ? [] : gradeStatusEntries(isError ? undefined : health);
  const allHealthy = statusEntries.length > 0 && statusEntries.every(({ status }) => status === 'healthy');

  const hasStatusPage = !!appConfig.statusUrl?.trim();

  return (
    <div className="flex flex-col gap-6 pt-3 pb-8">
      <div className="flex flex-col gap-1">
        <PanelHeading className="px-3">{t('c:support')}</PanelHeading>
        <NavSheetRow icon={InfoIcon} label={t('c:about')} render={<Link to={appConfig.aboutUrl} />} />
        <NavSheetRow icon={BookOpenIcon} label={t('c:api_docs')} render={<Link to="/docs" />} />
        {appConfig.has.chatSupport && (
          <NavSheetRow ref={supportRef} icon={LifeBuoyIcon} label={t('c:support')} onClick={() => askForHelp(supportRef)} />
        )}
        <NavSheetRow ref={contactRef} icon={MailIcon} label={t('c:contact_us')} onClick={() => contactFormHandler(contactRef)} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 px-3">
          <PanelHeading>{t('c:status')}</PanelHeading>
          {hasStatusPage && (
            <Button
              variant="link"
              size="auto"
              className="gap-1 text-xs opacity-50 hover:opacity-70"
              onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLinkIcon className="size-3" />
              {t('c:details')}
            </Button>
          )}
        </div>
        <div className={cn('gap-2 pt-1', allHealthy || isPending ? 'flex flex-col' : 'grid grid-cols-2')}>
          {/* The first check holds the healthy card's height, so the panel doesn't grow while it opens */}
          {isPending ? (
            <div className={cn(statusCardClass, 'text-muted-foreground')}>
              <span className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />
              {t('c:loading')}
            </div>
          ) : allHealthy ? (
            <div className={statusCardClass}>
              <StatusDot status="healthy" />
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
