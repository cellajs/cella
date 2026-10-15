import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import type { ReactNode } from 'react';
import { appConfig, type EntityRole, isUnpublishedDraft } from 'shared';
import { getChannelTile, getMemberStatIcon } from '~/lib/entity-modules';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { ChannelTileEntity } from '~/modules/entities/types';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { JoinedButton } from '~/modules/memberships/joined-button';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { AvatarGroup } from '~/modules/ui/avatar';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardFooter } from '~/modules/ui/card';
import { MemberAvatar } from '~/modules/user/member-avatar';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { dateShort } from '~/utils/date-short';
import { numberToColorClass } from '~/utils/number-to-color-class';

/** Max featured-role avatars fetched and shown per tile; the rest collapses into a +N bubble. */
const featuredAvatarLimit = 5;

/** The tile link is the card's only focus target, so the card draws its ring, shadow and press state. */
const tileCardClass =
  'has-[.tile-link:active]:press overflow-hidden shadow-xs transition [&:has(.tile-link:focus-visible)]:ring-2 [&:has(.tile-link:focus-visible)]:ring-ring [&:has(.tile-link:focus-visible)]:ring-offset-2 [&:has(.tile-link:focus-visible)]:ring-offset-background [&:has(.tile-link:hover)]:shadow-sm';

/** Descriptions can contain HTML: strip to plain text and cap at 200 chars for the footer preview. */
const descriptionPreview = (html: string) => {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text;
};

/** Member count, a draft's pending invites, post counts per `memberStatProductTypes` entry and the latest post date. */
function TileMeta({ entity, countRole }: { entity: ChannelTileEntity; countRole?: EntityRole }) {
  const counts = entity.included?.counts;
  const memberCount = counts && (countRole ? (counts.membership[countRole] ?? 0) : counts.membership.total);
  const postTypes = appConfig.memberStatProductTypes.filter((type) => counts?.entities?.[type] !== undefined);
  const lastPost = counts?.activity?.[appConfig.memberStatProductTypes[0]]?.created ?? null;

  return (
    <div className="inline-flex items-center gap-2 truncate text-muted-foreground text-sm">
      {memberCount !== undefined && (
        <span>
          {memberCount} {t(`c:${countRole ?? 'member'}`, { count: memberCount }).toLowerCase()}
        </span>
      )}
      {isUnpublishedDraft(entity) && !!counts?.membership.pending && (
        <span>
          · {counts.membership.pending} {t('c:pending').toLowerCase()}
        </span>
      )}
      {postTypes.length > 0 && (
        <span className="inline-flex items-center gap-2">
          ·
          {postTypes.map((type) => {
            const Icon = getMemberStatIcon(type);
            const count = counts?.entities?.[type] ?? 0;
            return (
              <span key={type} className="inline-flex items-center gap-1">
                {Icon && <Icon className="size-3.5" aria-hidden />}
                {count}
                <span className="sr-only">{t(`c:${type}`, { count })}</span>
              </span>
            );
          })}
        </span>
      )}
      <span>
        {memberCount !== undefined && '· '}
        {dateShort(lastPost ? new Date(lastPost) : entity.createdAt)}
      </span>
    </div>
  );
}

/** Up to {@link featuredAvatarLimit} members of the featured role, and a +N bubble for the rest. */
function FeaturedMembers({ entity, role }: { entity: ChannelTileEntity; role: EntityRole }) {
  // Every listed tile is readable by the viewer (membered or discovery row), so this never 403s
  const { data: members = [] } = useInfiniteQuery({
    ...membersListQueryOptions({
      entityId: entity.id,
      entityType: entity.entityType,
      tenantId: entity.tenantId,
      organizationId: entity.organizationId ?? entity.id,
      role,
      limit: featuredAvatarLimit,
    }),
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });
  if (!members.length) return null;

  const overflow = Math.max(0, (entity.included?.counts?.membership[role] ?? 0) - members.length);

  return (
    <div className="pointer-events-none absolute bottom-16 left-4 [&_button]:pointer-events-auto">
      <AvatarGroup className="justify-start">
        {members.map((member) => (
          <MemberAvatar key={member.id} member={member} className="size-8" />
        ))}
        {overflow > 0 && (
          <div className="z-10 flex size-8 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-background">+{overflow}</div>
        )}
      </AvatarGroup>
    </div>
  );
}

/**
 * The grid tile for every channel type. The channel's module shapes it through `channel.tile`
 * (see `ChannelTileConfig`): layout, the counted and featured roles, a parent chip, and render hooks
 * for the avatar, the meta line and a join action.
 */
export function ChannelTile({
  entity,
  currentChannelId,
  hideOwnRole = false,
}: {
  entity: ChannelTileEntity;
  /** Channel whose page shows this grid; a parent chip pointing at it is left out. */
  currentChannelId?: string;
  /** Suppress viewer-own state (joined role, pending invite) on grids that describe another user. */
  hideOwnRole?: boolean;
}) {
  const config = getChannelTile(entity.entityType);
  const { to, params, search } = getChannelRoute(entity);

  // Invited-but-not-accepted marker; accepting happens in the invites flow. Compact tiles have no footer to show it in.
  const { data: invitePending = false } = useQuery({
    ...meInvitationsQueryOptions(),
    select: ({ items }) => items.some(({ entity: invited }) => invited.id === entity.id),
    enabled: !hideOwnRole && config.layout !== 'compact',
  });

  const leading = config.leading?.(entity) ?? (
    <EntityAvatar className="size-10" type={entity.entityType} id={entity.id} name={entity.name} url={entity.thumbnailUrl} />
  );
  const heading = (
    <div className="flex grow flex-col gap-0.5 truncate">
      <div className="inline-flex items-center gap-2 truncate font-semibold text-sm leading-5">
        <span className="truncate">{entity.name}</span>
        {isUnpublishedDraft(entity) && <Badge variant="secondary">{t('c:draft')}</Badge>}
      </div>
      {config.meta?.(entity) ?? <TileMeta entity={entity} countRole={config.countRole} />}
    </div>
  );

  if (config.layout === 'compact') {
    return (
      <Card className={tileCardClass}>
        <CardContent>
          <Link
            to={to}
            params={params}
            search={search}
            {...pageTopHashNav}
            className="tile-link flex w-full items-center gap-3 focus-visible:outline-hidden focus-visible:ring-0"
          >
            {leading}
            {heading}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const parent = config.parent?.(entity);
  const parentRoute = parent && parent.id !== currentChannelId ? getChannelRoute(parent) : null;

  let action: ReactNode = null;
  if (invitePending) {
    action = (
      <Badge variant="secondary" className="self-start">
        {t('c:pending')}
      </Badge>
    );
  } else if (entity.membership && !hideOwnRole) {
    action = <JoinedButton channel={entity} role={entity.membership.role} className="w-full" redirectPath={null} />;
  } else {
    action = config.join?.(entity) ?? null;
  }
  const hasFooter = entity.description !== undefined || action !== null;

  return (
    <Card className={cn(tileCardClass, 'px-0 pt-0 sm:gap-3 sm:px-0 sm:pt-0', hasFooter ? 'sm:pb-3' : 'pb-0 sm:pb-0')}>
      <CardContent className="p-0 sm:p-0">
        <div className="relative">
          <Link
            to={to}
            params={params}
            search={search}
            {...pageTopHashNav}
            className="group tile-link relative block w-full focus-visible:outline-hidden focus-visible:ring-0"
          >
            <div
              className={cn(
                'relative flex aspect-3/1 min-h-30 w-full flex-col bg-center bg-cover',
                !entity.bannerUrl && numberToColorClass(entity.id),
              )}
              style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
            >
              <div className="grow" />
              <div className="flex min-h-14 w-full items-center gap-3 bg-background/50 px-4 py-2 backdrop-blur-xs transition-colors group-hover:bg-background/70 dark:bg-background/75 dark:group-hover:bg-background/85">
                {leading}
                {heading}
              </div>
            </div>
          </Link>

          {/* Siblings of the tile link, not children: the chip is a link and the avatars are buttons of their own */}
          {parent && parentRoute && (
            <Link
              {...parentRoute}
              className="focus-effect absolute top-2 right-2 max-w-40 truncate rounded bg-background/60 px-1.5 py-0.5 text-xs backdrop-blur-xs hover:underline"
            >
              {t('c:in_channel', { name: parent.name })}
            </Link>
          )}
          {config.featuredRole && <FeaturedMembers entity={entity} role={config.featuredRole} />}
        </div>
      </CardContent>
      {hasFooter && (
        <CardFooter className="grow flex-col items-stretch gap-3 sm:px-3">
          {entity.description !== undefined && (
            <p className="text-muted-foreground text-sm">{(entity.description && descriptionPreview(entity.description)) || t('c:no_description')}</p>
          )}
          {action && <div className="mt-auto flex flex-col">{action}</div>}
        </CardFooter>
      )}
    </Card>
  );
}
