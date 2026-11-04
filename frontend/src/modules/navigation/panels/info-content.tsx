import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpenIcon, ExternalLinkIcon, InfoIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { askForHelp } from '~/modules/common/error-helpers';
import { StatusDot, type StatusDotVariant } from '~/modules/common/status-dot';
import { menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { type HealthStatus, healthQueryOptions } from '~/modules/navigation/panels/query';
import { type GradedStatusEntry, gradeStatusEntries, worstStatus } from '~/modules/navigation/panels/status-entries';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/modules/ui/hover-card';
import { cn } from '~/utils/cn';

const statusVariant: Record<HealthStatus, StatusDotVariant> = { healthy: 'success', degraded: 'warning', unhealthy: 'destructive' };

/** One status entry; hover or focus shows what it covers and, when not healthy, which check failed and why. */
function StatusEntryCard({ graded: { entry, status, component, reason } }: { graded: GradedStatusEntry }) {
  const { t } = useTranslation();

  return (
    <HoverCard>
      <HoverCardTrigger render={<button type="button" />} className="focus-effect flex items-center gap-2 rounded-sm px-1 py-1 text-left text-xs">
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

  return (
    <div className="flex flex-col gap-4 pt-2 pb-8">
      <div className="flex flex-col gap-1">
        <NavSheetRow icon={InfoIcon} label={t('c:about')} render={<Link to={appConfig.aboutUrl} />} />
        <NavSheetRow icon={BookOpenIcon} label={t('c:docs')} render={<Link to="/docs" />} />
        {appConfig.has.chatSupport && (
          <NavSheetRow ref={supportRef} icon={LifeBuoyIcon} label={t('c:support')} onClick={() => askForHelp(supportRef)} />
        )}
        <NavSheetRow ref={contactRef} icon={MailIcon} label={t('c:contact_us')} onClick={() => contactFormHandler(contactRef)} />
      </div>
      <div aria-hidden className={cn(menuHairlineClass, 'mx-0 mb-1')} />
      <StatusTile />
    </div>
  );
}

/** The worst status of the services with the app version; while one is not healthy, the entries follow in a grid. */
function StatusTile() {
  const { t } = useTranslation();
  const { data: health } = useSuspenseQuery(healthQueryOptions());
  const statusEntries = gradeStatusEntries(health);
  const status = worstStatus(statusEntries);

  const hasStatusPage = !!appConfig.statusUrl.trim();
  const sourceUrl = appConfig.company.githubUrl;

  return (
    // Not a button, since its entries and status page link are; the transparent border keeps a NavSheetRow's box
    <div className="flex flex-col gap-2 border border-transparent px-3 py-2.5">
      <div className="flex min-h-6 items-center gap-2 text-sm">
        {/* The dot takes a NavSheetRow's 16px icon column, so the label lines up with the rows above */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          <StatusDot variant={statusVariant[status]} />
        </span>
        <span className="min-w-0 flex-1 truncate">{t(status === 'healthy' ? 'c:all_systems_healthy' : `c:${status}`)}</span>
        <Badge
          variant="secondary"
          render={sourceUrl ? (props) => <a {...props} href={sourceUrl} target="_blank" rel="noreferrer" title={t('c:source_code')} /> : undefined}
        >
          <span className="sr-only">{t('c:version')}</span>
          {__PKG_VERSION__}
        </Badge>
        {hasStatusPage && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('c:details')}
            className="-my-1 -mr-1.5 size-7 text-muted-foreground"
            onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLinkIcon className="size-4" />
          </Button>
        )}
      </div>
      {status !== 'healthy' && (
        <div className="-mx-1 grid grid-cols-2 gap-1">
          {statusEntries.map((graded) => (
            <StatusEntryCard key={graded.entry.id} graded={graded} />
          ))}
        </div>
      )}
    </div>
  );
}
