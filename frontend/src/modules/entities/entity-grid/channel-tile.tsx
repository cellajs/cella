import { Link } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type EntityRole, hierarchy, isUnpublishedDraft } from 'shared';
import { getMemberStatIcon } from '~/lib/entity-modules';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { ChannelTileEntity, EnrichedChannel } from '~/modules/entities/types';
import { JoinedButton } from '~/modules/memberships/joined-button';
import { Badge } from '~/modules/ui/badge';
import { Card } from '~/modules/ui/card';
import { MemberAvatarGroup } from '~/modules/user/member-avatar';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { dateShort } from '~/utils/date-short';
import { formatCount } from '~/utils/format-count';
import { numberToColorClass } from '~/utils/number-to-color-class';

const ChannelTileContext = createContext<ChannelTileEntity | null>(null);

function useTileEntity(): ChannelTileEntity {
  const entity = useContext(ChannelTileContext);
  if (!entity) throw new Error('ChannelTile parts render inside a ChannelTileCard');
  return entity;
}

/** Descriptions can contain HTML: strip to plain text and cap at 200 chars for the preview. */
const descriptionPreview = (html: string) => {
  const text = html
    .replace(/<[^>]+>/g, ' ')
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
          // The edge is drawn over the content, so a cover is shaded at its edge in its own hue and a white cover still has one
          'has-[.tile-link:active]:press relative gap-0 overflow-hidden border-0 py-0 transition after:pointer-events-none after:absolute after:inset-0 after:inset-ring after:inset-ring-edge-overlay after:rounded-[inherit] focus-ring:has-[.tile-link:focus-visible]:ring-2 focus-ring:has-[.tile-link:focus-visible]:ring-ring focus-ring:has-[.tile-link:focus-visible]:ring-offset-2 focus-ring:has-[.tile-link:focus-visible]:ring-offset-background sm:gap-0 sm:py-0',
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

/** Banner image (or the entity's color) with a frosted bar holding `children`, by default the heading. `overlay` sits on the banner beside the link. */
export function ChannelTileBanner({ overlay, children }: ChannelTileBannerProps) {
  const entity = useTileEntity();
  return (
    <div className="relative">
      <TileLink className="block">
        <div
          className={cn('relative flex aspect-3/1 min-h-30 flex-col bg-center bg-cover', !entity.bannerUrl && numberToColorClass(entity.id))}
          style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
        >
          <div className="grow" />
          <div className="flex min-h-14 items-center gap-3 bg-background/50 px-4 py-2 backdrop-blur-xs transition-colors group-hover/tile-link:bg-background/70 dark:bg-background/75 dark:group-hover/tile-link:bg-background/85">
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
    <TileLink className="flex w-full items-center gap-3 p-3 transition-colors hover:bg-accent/50 sm:p-6">
      {children ?? <ChannelTileHeading />}
    </TileLink>
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
      {leading ?? <EntityAvatar className="size-10" type={entity.entityType} id={entity.id} name={entity.name} url={entity.thumbnailUrl} />}
      <div className="flex grow flex-col gap-0.5 truncate">
        <div className="inline-flex items-center gap-2 truncate font-semibold text-sm leading-5">
          <span className="truncate">{entity.name}</span>
          {isUnpublishedDraft(entity) && <Badge variant="secondary">{t('c:draft')}</Badge>}
        </div>
        {meta ?? <ChannelTileStats />}
      </div>
    </>
  );
}

interface ChannelTileStatsProps {
  /** Counts only this role's members (default: all members). */
  countRole?: EntityRole;
}

/** Compact counts: members, a draft's pending invites and posts per `memberStatProductTypes` entry, then the latest post date (or the creation date). */
export function ChannelTileStats({ countRole }: ChannelTileStatsProps) {
  const { t } = useTranslation();
  const entity = useTileEntity();
  const counts = entity.included?.counts;
  const memberCount = counts && (countRole ? (counts.membership[countRole] ?? 0) : counts.membership.total);
  const postTypes = appConfig.memberStatProductTypes.filter((type) => counts?.entities?.[type] !== undefined);
  const lastPostedAt = counts?.activity?.[appConfig.memberStatProductTypes[0]]?.created ?? null;

  return (
    <div className="inline-flex items-center gap-2 truncate text-muted-foreground text-sm">
      {memberCount !== undefined && (
        <span>
          {formatCount(memberCount)} {t(`c:${countRole ?? 'member'}`, { count: memberCount }).toLowerCase()}
        </span>
      )}
      {isUnpublishedDraft(entity) && !!counts?.membership.pending && (
        <span>
          · {formatCount(counts.membership.pending)} {t('c:pending').toLowerCase()}
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
                {Icon && <Icon className="size-3.5" />}
                {formatCount(count)}
                <span className="sr-only">{t(`c:${type}`, { count })}</span>
              </span>
            );
          })}
        </span>
      )}
      <span>
        {memberCount !== undefined && '· '}
        {dateShort(lastPostedAt ? new Date(lastPostedAt) : entity.createdAt)}
      </span>
    </div>
  );
}

/** Banner overlay, centered above the heading bar: the member previews on the row (`include=members`, the channel's most privileged role) and a +N bubble for the rest. */
export function ChannelTileMembers() {
  const entity = useTileEntity();
  const members = entity.included?.members;
  if (!members?.length) return null;

  const role = hierarchy.getMostPrivilegedRole(entity.entityType);
  const total = Math.max(members.length, entity.included?.counts?.membership[role] ?? 0);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-14 flex items-center justify-center [&_button]:pointer-events-auto">
      <MemberAvatarGroup members={members} total={total} itemClassName="size-10" />
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
      className="focus-effect absolute top-2 right-2 max-w-40 truncate rounded bg-background/60 px-1.5 py-0.5 text-xs backdrop-blur-xs hover:underline"
    >
      {t('c:in_channel', { name: parent.name })}
    </Link>
  );
}

interface ChannelTileFooterProps {
  children: ReactNode;
}

/** Area below the banner; it takes the card's remaining height and disappears when its parts render nothing. */
export function ChannelTileFooter({ children }: ChannelTileFooterProps) {
  return <div className="flex grow flex-col gap-3 p-3 empty:hidden">{children}</div>;
}

/** Plain-text preview of the description; nothing for a row without a `description` field. It grows, so what follows sits at the bottom. */
export function ChannelTileDescription() {
  const { t } = useTranslation();
  const { description } = useTileEntity();
  if (description === undefined) return null;
  return <p className="grow text-muted-foreground text-sm">{(description && descriptionPreview(description)) || t('c:no_description')}</p>;
}

interface ChannelTileMembershipProps {
  /** Shows only `fallback`, for grids that describe another user. */
  hideOwnRole?: boolean;
  /** Shown without a membership or an invite, typically a join button. */
  fallback?: ReactNode;
}

/** The viewer's own state: a pending-invite badge or the joined button, else `fallback`. */
export function ChannelTileMembership({ hideOwnRole = false, fallback = null }: ChannelTileMembershipProps) {
  const { t } = useTranslation();
  const entity = useTileEntity();
  if (hideOwnRole) return fallback;
  if (entity.invited) return <Badge variant="secondary">{t('c:pending')}</Badge>;
  if (entity.membership)
    return <JoinedButton channel={entity} role={entity.membership.role} variant="outline" className="w-full" redirectPath={null} />;
  return fallback;
}

interface ChannelTileProps extends Pick<ChannelTileMembershipProps, 'hideOwnRole'> {
  entity: ChannelTileEntity;
}

/** The default tile, composed from the parts: banner with member previews, description, and the viewer's membership. */
export function ChannelTile({ entity, hideOwnRole }: ChannelTileProps) {
  return (
    <ChannelTileCard entity={entity}>
      <ChannelTileBanner overlay={<ChannelTileMembers />} />
      <ChannelTileFooter>
        <ChannelTileDescription />
        <ChannelTileMembership hideOwnRole={hideOwnRole} />
      </ChannelTileFooter>
    </ChannelTileCard>
  );
}
