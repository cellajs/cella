import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpenIcon, ExternalLinkIcon, InfoIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { handleAskForHelp } from '~/modules/common/error-helpers';
import { type HealthStatus, healthQueryOptions } from '~/modules/navigation/menu-sheet/query';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const statusStyleMap: Record<HealthStatus, { dot: string; pulse: string }> = {
  healthy: { dot: 'bg-success', pulse: '[--status-pulse-color:color-mix(in_oklch,var(--success)_50%,transparent)]' },
  degraded: { dot: 'bg-warning', pulse: '[--status-pulse-color:color-mix(in_oklch,var(--warning)_50%,transparent)]' },
  unhealthy: {
    dot: 'bg-destructive',
    pulse: '[--status-pulse-color:color-mix(in_oklch,var(--destructive)_50%,transparent)]',
  },
};

function StatusCard({ label, status }: { label: string; status: HealthStatus }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-2">
      <span
        className={cn(
          'inline-block size-2 shrink-0 animate-[status-pulse_3.5s_ease-in-out_infinite] rounded-full',
          statusStyleMap[status].dot,
          statusStyleMap[status].pulse,
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-xs">{label}</p>
      </div>
    </div>
  );
}

/**
 * Info content: support links and app status.
 */
export const InfoContent = () => {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement | null>(null);
  const contactRef = useRef<HTMLButtonElement | null>(null);
  const { data: health, isError } = useQuery(healthQueryOptions());
  const statusServices = Object.entries(health?.components ?? {}).filter(([, component]) => component.label);

  const hasStatusPage = !!appConfig.statusUrl?.trim();

  return (
    <div className="flex flex-col gap-6 pt-3 pb-8">
      <div className="flex flex-col gap-1">
        <h3 className="px-4 font-medium text-muted-foreground/70 text-sm lowercase">{t('c:support')}</h3>
        <Button
          variant="ghost"
          className="w-full justify-start px-3.5 text-left"
          render={<Link to={appConfig.aboutUrl} draggable={false} />}
        >
          <InfoIcon className="mr-2 size-4" aria-hidden="true" />
          {t('c:about')}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start px-3.5 text-left"
          render={<Link to="/docs" draggable={false} />}
        >
          <BookOpenIcon className="mr-2 size-4" aria-hidden="true" />
          {t('c:api_docs')}
        </Button>
        {appConfig.has.chatSupport && (
          <Button
            ref={supportRef}
            variant="ghost"
            className="w-full justify-start px-3.5 text-left"
            onClick={() => handleAskForHelp(supportRef)}
          >
            <LifeBuoyIcon className="mr-2 size-4" aria-hidden="true" />
            {t('c:support')}
          </Button>
        )}
        <Button
          ref={contactRef}
          variant="ghost"
          className="w-full justify-start px-3.5 text-left"
          onClick={() => contactFormHandler(contactRef)}
        >
          <MailIcon className="mr-2 size-4" aria-hidden="true" />
          {t('c:contact_us')}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 px-4">
          <h3 className="font-medium text-muted-foreground/70 text-sm lowercase">{t('c:status')}</h3>
          {hasStatusPage && (
            <Button
              variant="link"
              size="auto"
              className="gap-1 text-xs opacity-50 hover:opacity-70"
              onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLinkIcon className="size-3" aria-hidden="true" />
              {t('c:details')}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {isError ? (
            <StatusCard label="API" status="unhealthy" />
          ) : (
            statusServices.map(([key, component]) => (
              <StatusCard key={key} label={component.label ?? key} status={component.status} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
