import { Link } from '@tanstack/react-router';
import { Fragment, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ChannelBase, UserBase } from 'sdk';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { MiddleCut } from '~/modules/common/middle-cut';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EnrichedChannel } from '~/modules/entities/types';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

interface PageHeaderProps extends Omit<PageCoverProps, 'id' | 'url'> {
  entity: ChannelBase | UserBase;
  panel?: ReactNode;
  subline?: ReactNode;
  /** Replaces the entity type word that opens the context line, e.g. "Public project". */
  typeLabel?: string;
  avatarBadge?: ReactNode;
  /** Root first. */
  parents?: EnrichedChannel[];
}

export function PageHeader({ entity, panel, subline, typeLabel, avatarBadge, parents = [], ...coverProps }: PageHeaderProps) {
  const isUser = entity.entityType === 'user';

  return (
    <div className="relative w-full">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      {/* Scrolled to its top, it lines up with the nav rail and the nav sheet headers */}
      <div className="bg-background/50 dark:bg-background/75 absolute bottom-0 flex min-h-16 w-full p-1 backdrop-blur-xs" id={pageTopHashNav.hash}>
        <div className={cn('relative shrink-0', isUser ? 'mx-3 -mt-12 size-20 sm:-mt-15 sm:size-26' : 'mx-2 my-1 size-12')}>
          <EntityAvatar
            id={entity.id}
            name={entity.name}
            type={entity.entityType}
            url={entity.thumbnailUrl}
            className={cn('size-full', isUser && 'ring-4 ring-black/10')}
          />
          {avatarBadge}
        </div>

        <div className="flex flex-col truncate py-1 pl-1">
          <h1 className="mb-1 leading-6 font-semibold max-sm:line-clamp-2 max-sm:wrap-break-word max-sm:whitespace-normal sm:truncate md:text-xl">
            {entity.name}
          </h1>

          <div className="flex items-center gap-2 text-sm">
            {subline ?? (
              <p className="text-faint-foreground flex min-w-0 items-center gap-1 pr-1">
                <ContextLine type={entity.entityType} typeLabel={typeLabel} ancestors={parents} />
                {appConfig.mode === 'development' && <span className="mt-0.5 ml-2 text-xs opacity-50 max-sm:hidden">{entity.id}</span>}
              </p>
            )}
          </div>
        </div>
        {panel && <div className="ml-auto flex items-center">{panel}</div>}
      </div>
    </div>
  );
}

/** The entity's type and where it sits: "Project in Course (Class, Group) by Organization"; a phone keeps the top channel only. */
function ContextLine({
  type,
  typeLabel,
  ancestors,
}: {
  type: (ChannelBase | UserBase)['entityType'];
  typeLabel?: string;
  ancestors: EnrichedChannel[];
}) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const organization = ancestors.find((ancestor) => ancestor.entityType === 'organization');
  const [channel, ...subChannels] = ancestors.filter((ancestor) => ancestor.entityType !== 'organization');

  const label = typeLabel ?? t(`c:${type}`);
  const trail = channel && <ChannelTrail channel={channel} subChannels={isMobile ? [] : subChannels} />;
  const organizationLink = organization && !isMobile && <ContextLink channel={organization} />;

  if (!trail && !organizationLink) return <span className="text-foreground">{label}</span>;

  const placement = trail && organizationLink ? 'in_by' : trail ? 'in' : 'by';
  return (
    <Trans
      t={t}
      i18nKey={`c:entity_context.${placement}`}
      values={{ type: label, channel: channel?.name, organization: organization?.name }}
      components={{
        type: <span className="text-foreground" />,
        ...(trail && { channel: trail }),
        ...(organizationLink && { organization: organizationLink }),
      }}
    />
  );
}

function ChannelTrail({ channel, subChannels }: { channel: EnrichedChannel; subChannels: EnrichedChannel[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <ContextLink channel={channel} className="max-w-48" />
      {subChannels.length > 0 && (
        <span className="flex min-w-0 items-center">
          (
          {subChannels.map((subChannel, index) => (
            <Fragment key={subChannel.id}>
              {index > 0 && <span className="mr-1">,</span>}
              <ContextLink channel={subChannel} className="max-w-32" />
            </Fragment>
          ))}
          )
        </span>
      )}
    </span>
  );
}

function ContextLink({ channel, className }: { channel: EnrichedChannel; className?: string }) {
  const route = getChannelRoute(channel);
  return (
    <Link
      to={route.to}
      params={route.params}
      {...pageTopHashNav}
      draggable={false}
      className={cn(
        'focus-inset link-reveal text-muted-foreground hover:text-foreground -m-1 flex min-w-0 rounded-sm p-1 transition-colors',
        className,
      )}
    >
      <MiddleCut text={channel.name} />
    </Link>
  );
}
