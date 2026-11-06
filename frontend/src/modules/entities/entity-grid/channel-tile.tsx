import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';
import { createContext, type ReactNode, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type EntityRole, hierarchy, isUnpublishedDraft } from 'shared';
import { getMemberStatIcon } from '~/lib/entity-modules';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { ChannelTileEntity, EnrichedChannel } from '~/modules/entities/types';
import { meInvitationsQueryOptions, myMembershipsQueryOptions } from '~/modules/me/query';
import { JoinedButton } from '~/modules/memberships/joined-button';
import { Badge } from '~/modules/ui/badge';
import { Card } from '~/modules/ui/card';
import { MemberAvatarGroup } from '~/modules/user/member-avatar';
import { findMembership } from '~/query/enrichment/helpers';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { dateFull } from '~/utils/date-full';
import { dateShort } from '~/utils/date-short';
import { formatCount } from '~/utils/format-count';
import { placeholderCoverClass } from '~/utils/placeholder-color-class';

const ChannelTileContext = createContext<ChannelTileEntity | null>(null);

function useTileEntity(): ChannelTileEntity {
  const entity = useContext(ChannelTileContext);
  if (!entity) throw new Error('ChannelTile parts render inside a ChannelTileCard');
  return entity;
}

/** Descriptions can contain HTML: strip to plain text and cap at 200 chars for the preview. */
const descriptionPreview = (html: string) => {
  const text = html
    .replace(/<[^<>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text;
};

interface ChannelTileCardProps {
  entity: ChannelTileEntity;
  className?: string;
  children: ReactNode;
}

/** Hands the entity to every part inside, and draws the ring and press state of the tile link, its only focus target. */
export function ChannelTileCard({ entity, className, children }: ChannelTileCardProps) {
  return (
    <ChannelTileContext.Provider value={entity}>
      <Card
        className={cn(
          // The edge is drawn over the content, so a white cover still has one
          'has-[.tile-link:active]:press after:inset-ring-edge-overlay focus-ring:has-[.tile-link:focus-visible]:ring-2 focus-ring:has-[.tile-link:focus-visible]:ring-ring focus-ring:has-[.tile-link:focus-visible]:ring-offset-2 focus-ring:has-[.tile-link:focus-visible]:ring-offset-background relative gap-0 overflow-hidden border-0 py-0 transition after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring sm:gap-0 sm:py-0',
          className,
        )}
      >
        {children}
      </Card>
    </ChannelTileContext.Provider>
  );
}

/** The link to the channel's page; the card styles itself from it through the `tile-link` class. */
function TileLink({ className, children }: { className?: string; children: ReactNode }) {
  const entity = useTileEntity();
  return (
    <Link
      {...getChannelRoute(entity)}
      {...pageTopHashNav}
      draggable={false}
      className={cn('group/tile-link tile-link focus-visible:outline-hidden', className)}
    >
      {children}
    </Link>
  );
}

interface ChannelTileBannerProps {
  overlay?: ReactNode;
  children?: ReactNode;
}

/** Banner image (or the entity's color) with a bar holding `children`, by default the heading. */
export function ChannelTileBanner({ overlay, children }: ChannelTileBannerProps) {
  const entity = useTileEntity();
  return (
    <div className="relative">
      <TileLink className="block">
        <div
          // A min height would transfer through the aspect ratio into a min width wider than a phone's column
          className={cn('relative flex aspect-9/4 flex-col bg-cover bg-center sm:aspect-5/2', !entity.bannerUrl && placeholderCoverClass(entity.id))}
          style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
        >
          <div className="grow" />
          <div className="bg-background/50 group-hover/tile-link:bg-background/70 dark:bg-background/75 dark:group-hover/tile-link:bg-background/85 flex min-h-14 items-center gap-3 px-4 py-2 backdrop-blur-xs transition-colors">
            {children ?? <ChannelTileHeading />}
          </div>
        </div>
      </TileLink>
      {/* Siblings of the tile link, not children: overlay parts are links and buttons of their own */}
      {overlay}
    </div>
  );
}

interface ChannelTileRowProps {
  children?: ReactNode;
}

/** A banner-less tile: one linked row holding `children`, by default the heading. */
export function ChannelTileRow({ children }: ChannelTileRowProps) {
  return (
    <TileLink className="hover:bg-hover flex w-full items-center gap-3 p-3 transition-colors sm:p-6">{children ?? <ChannelTileHeading />}</TileLink>
  );
}

interface ChannelTileHeadingProps {
  leading?: ReactNode;
  meta?: ReactNode;
}

/** Avatar (or `leading`), name with a draft badge, and the meta line (or `meta`, by default {@link ChannelTileStats}). */
export function ChannelTileHeading({ leading, meta }: ChannelTileHeadingProps) {
  const { t } = useTranslation();
  const entity = useTileEntity();
  return (
    <>
      {leading ?? <EntityAvatar className="size-8 sm:size-10" type={entity.entityType} id={entity.id} name={entity.name} url={entity.thumbnailUrl} />}
      <div className="flex grow flex-col gap-0.5 truncate">
        <div className="inline-flex items-center gap-2 truncate text-sm leading-5 font-semibold">
          <span className="truncate">
            <HighlightText text={entity.name} />
          </span>
          {isUnpublishedDraft(entity) && <Badge variant="secondary">{t('c:draft')}</Badge>}
        </div>
        {meta ?? <ChannelTileStats />}
      </div>
    </>
  );
}

interface TileCountProps {
  icon?: IconComponent;
  count: number;
  /** The counted noun, already pluralized for `count`. */
  resource: string;
}

/** An icon and a compact count; a tooltip and assistive technology get the exact count with its noun. */
function TileCount({ icon: Icon, count, resource }: TileCountProps) {
  const { t } = useTranslation();
  const label = t('c:resource_count', { count, resource });
  return (
    <TooltipButton toolTipContent={label}>
      <span className="inline-flex items-center gap-1">
        {Icon && <Icon className="size-3.5" />}
        <span aria-hidden="true">{formatCount(count)}</span>
        <span className="sr-only">{label}</span>
      </span>
    </TooltipButton>
  );
}

/** Compact stats: posts per `memberStatProductTypes` entry, then the latest post date (or the creation date). */
export function ChannelTileStats() {
  const { t } = useTranslation();
  const entity = useTileEntity();
  const counts = entity.included?.counts;
  const postTypes = appConfig.memberStatProductTypes.filter((type) => counts?.entities?.[type] !== undefined);
  const lastPostedAt = counts?.activity?.[appConfig.memberStatProductTypes[0]]?.created ?? null;
  const shownDate = lastPostedAt ? new Date(lastPostedAt) : entity.createdAt;
  const dateLabel = t(lastPostedAt ? 'c:last_post_on' : 'c:created_on', { date: dateFull(shownDate) });

  return (
    <div className="text-muted-foreground inline-flex items-center gap-2 truncate text-xs sm:text-sm">
      {postTypes.map((type) => {
        const count = counts?.entities?.[type] ?? 0;
        return <TileCount key={type} icon={getMemberStatIcon(type)} count={count} resource={t(`c:${type}`, { count })} />;
      })}
      {postTypes.length > 0 && <span aria-hidden="true">·</span>}
      <TooltipButton toolTipContent={dateLabel}>
        <span>
          <span aria-hidden="true">{dateShort(shownDate)}</span>
          <span className="sr-only">{dateLabel}</span>
        </span>
      </TooltipButton>
    </div>
  );
}

interface ChannelTileMemberCountProps {
  /** Counts only this role's members (default: all members). */
  countRole?: EntityRole;
}

/** Footer part at the end of its line: the member count, and a draft's pending invites. Nothing for a row without counts. */
export function ChannelTileMemberCount({ countRole }: ChannelTileMemberCountProps) {
  const { t } = useTranslation();
  const entity = useTileEntity();
  const counts = entity.included?.counts;
  if (!counts) return null;
  const memberCount = countRole ? (counts.membership[countRole] ?? 0) : counts.membership.total;

  return (
    // As tall as the joined button on its line, so a tile without that button keeps its height
    <span className="text-muted-foreground ms-auto inline-flex min-h-9 items-center gap-2 text-xs whitespace-nowrap sm:text-sm">
      <TileCount icon={UsersIcon} count={memberCount} resource={t(`c:${countRole ?? 'member'}`, { count: memberCount })} />
      {isUnpublishedDraft(entity) && !!counts.membership.pending && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {formatCount(counts.membership.pending)} {t('c:pending').toLowerCase()}
          </span>
        </>
      )}
    </span>
  );
}

/** Banner overlay: the member previews on the row (`include=members`) and a +N bubble for the rest. */
export function ChannelTileMembers() {
  const entity = useTileEntity();
  const members = entity.included?.members;
  if (!members?.length) return null;

  const role = hierarchy.getMostPrivilegedRole(entity.entityType);
  const total = Math.max(members.length, entity.included?.counts?.membership[role] ?? 0);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-14 flex items-center justify-center [&_button]:pointer-events-auto">
      <MemberAvatarGroup members={members} total={total} itemClassName="size-8 sm:size-10" />
    </div>
  );
}

interface ChannelTileParentChipProps {
  parent: EnrichedChannel | null | undefined;
}

/** Banner overlay: a chip linking to the channel this one sits in. */
export function ChannelTileParentChip({ parent }: ChannelTileParentChipProps) {
  const { t } = useTranslation();
  if (!parent) return null;
  return (
    <Link
      {...getChannelRoute(parent)}
      {...pageTopHashNav}
      draggable={false}
      className="focus-effect bg-background/60 absolute top-2 right-2 max-w-40 truncate rounded px-1.5 py-0.5 text-xs backdrop-blur-xs hover:underline"
    >
      {t('c:in_channel', { name: parent.name })}
    </Link>
  );
}

interface ChannelTileFooterProps {
  children: ReactNode;
}

/** Area below the banner; disappears when its parts render nothing. */
export function ChannelTileFooter({ children }: ChannelTileFooterProps) {
  return <div className="flex grow flex-wrap content-between items-center gap-3 px-4 py-3 empty:hidden">{children}</div>;
}

/** Plain-text preview of the description on a line of its own; nothing for a row without a `description` field. */
export function ChannelTileDescription() {
  const { t } = useTranslation();
  const { description } = useTileEntity();
  if (description === undefined) return null;
  return <p className="text-muted-foreground w-full text-sm">{(description && descriptionPreview(description)) || t('c:no_description')}</p>;
}

interface ChannelTileMembershipProps {
  /** Shows only `fallback`, for grids that describe another user. */
  hideOwnRole?: boolean;
  /** Shown without a membership or an invite. */
  fallback?: ReactNode;
}

/** The viewer's own state: a pending-invite badge once the invites list is cached, or the joined button, else `fallback`. */
export function ChannelTileMembership({ hideOwnRole = false, fallback = null }: ChannelTileMembershipProps) {
  const { t } = useTranslation();
  const entity = useTileEntity();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const { data: myInvites } = useQuery({ ...meInvitationsQueryOptions(), enabled: false });
  const membership = findMembership(myMemberships?.items ?? [], entity.id);
  if (hideOwnRole) return fallback;
  if (myInvites?.items.some((invite) => invite.entity.id === entity.id)) return <Badge variant="secondary">{t('c:pending')}</Badge>;
  if (membership) return <JoinedButton channel={entity} role={membership.role} redirectPath={null} />;
  return fallback;
}

interface ChannelTileProps extends Pick<ChannelTileMembershipProps, 'hideOwnRole'> {
  entity: ChannelTileEntity;
}

/** The default tile, composed from the parts: banner with member previews, description, the viewer's membership and the member count. */
export function ChannelTile({ entity, hideOwnRole }: ChannelTileProps) {
  return (
    <ChannelTileCard entity={entity}>
      <ChannelTileBanner overlay={<ChannelTileMembers />} />
      <ChannelTileFooter>
        <ChannelTileDescription />
        <ChannelTileMembership hideOwnRole={hideOwnRole} />
        <ChannelTileMemberCount />
      </ChannelTileFooter>
    </ChannelTileCard>
  );
}
