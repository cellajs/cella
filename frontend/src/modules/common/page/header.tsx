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
  /** Controls at the header's end; the viewer's role shows on the membership button placed here, not in the header. */
  panel?: ReactNode;
  /** Takes the place of the context line below the name, for an entity that sits in no hierarchy. */
  subline?: ReactNode;
  /** Ancestor chain, root first. Entries must be enriched: their routes need `ancestorSlugs`. */
  parents?: EnrichedChannel[];
  /** @deprecated Use `parents`. */
  parent?: EnrichedChannel;
}

export function PageHeader({ entity, panel, subline, parents, parent, ...coverProps }: PageHeaderProps) {
  // Ancestor chain, root first; the deprecated single `parent` folds in
  const ancestors = parents ?? (parent ? [parent] : []);

  return (
    <div className="relative w-full">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute bottom-0 flex min-h-18 w-full bg-background/50 p-1 backdrop-blur-xs dark:bg-background/75" id={pageTopHashNav.hash}>
        <EntityAvatar
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          // A user avatar rises by half its size to sit centered on the cover's edge
          className={entity.entityType === 'user' ? 'mx-3 -mt-10 size-20 ring-4 ring-black/10 sm:-mt-13 sm:size-26' : 'm-2 size-12'}
        />

        <div className="flex flex-col truncate py-1.5 pl-1">
          <h1 className="max-sm:wrap-break-word mb-1 font-semibold leading-6 max-sm:line-clamp-2 max-sm:whitespace-normal sm:truncate md:text-xl">
            {entity.name}
          </h1>

          <div className="flex items-center gap-2 text-sm">
            {subline ?? (
              // The text column clips: each link's ring sits in a padding its negative margin takes back
              <p className="flex min-w-0 items-center gap-1 pr-1 text-faint-foreground">
                <ContextLine type={entity.entityType} ancestors={ancestors} />
                {appConfig.mode === 'development' && <span className="mt-0.5 ml-2 text-xs opacity-50 max-sm:hidden">{entity.id}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center">{panel}</div>
      </div>
    </div>
  );
}

interface ContextLineProps {
  type: (ChannelBase | UserBase)['entityType'];
  ancestors: EnrichedChannel[];
}

/** The entity's type and where it sits: "Project in Course (Class, Group) by Organization"; a phone keeps the top channel only. */
function ContextLine({ type, ancestors }: ContextLineProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const organization = ancestors.find((ancestor) => ancestor.entityType === 'organization');
  const [channel, ...subChannels] = ancestors.filter((ancestor) => ancestor.entityType !== 'organization');

  const label = t(`c:${type}`);
  const typeElement = <span className="font-semibold text-foreground" />;
  const trail = channel && <ChannelTrail channel={channel} subChannels={isMobile ? [] : subChannels} />;
  const organizationLink = organization && !isMobile && <ContextLink channel={organization} />;
  const values = { type: label, channel: channel?.name, organization: organization?.name };

  if (trail && organizationLink) {
    return (
      <Trans
        t={t}
        i18nKey="c:entity_context.in_by"
        values={values}
        components={{ type: typeElement, channel: trail, organization: organizationLink }}
      />
    );
  }
  if (trail) return <Trans t={t} i18nKey="c:entity_context.in" values={values} components={{ type: typeElement, channel: trail }} />;
  if (organizationLink) {
    return <Trans t={t} i18nKey="c:entity_context.by" values={values} components={{ type: typeElement, organization: organizationLink }} />;
  }
  return <span className="font-semibold text-foreground">{label}</span>;
}

interface ChannelTrailProps {
  /** The channel right below the organization. */
  channel: EnrichedChannel;
  /** The channels between it and the entity, root first, listed in parentheses. */
  subChannels: EnrichedChannel[];
}

function ChannelTrail({ channel, subChannels }: ChannelTrailProps) {
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

interface ContextLinkProps {
  channel: EnrichedChannel;
  className?: string;
}

/** A name in the context line, linking to its page and cut in the middle when the line runs short. */
function ContextLink({ channel, className }: ContextLinkProps) {
  const route = getChannelRoute(channel);
  return (
    <Link
      to={route.to}
      params={route.params}
      {...pageTopHashNav}
      draggable={false}
      className={cn(
        'focus-inset link-decoration active:link-decoration-strong -m-1 flex min-w-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground hover:underline',
        className,
      )}
    >
      <MiddleCut text={channel.name} />
    </Link>
  );
}
