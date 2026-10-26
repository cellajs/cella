import { PlusIcon } from 'lucide-react';
import { type ReactNode, type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { TileListHeading } from '~/modules/common/expandable-tile';
import { ChannelTileCard, ChannelTileHeading, ChannelTileRow } from '~/modules/entities/entity-grid/channel-tile';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { organizationSections } from '~/modules/navigation/menu-sheet/helpers/organization-sections';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

// With nothing below organizations in the menu, the organizations are the tiles
const hasChannelsBelowOrganizations = appConfig.menuStructure.some(
  ({ entityType, subentityType }) => entityType !== 'organization' || !!subentityType,
);

interface ChannelTilesSectionProps {
  entityType: ChannelEntityType;
  title: string;
  items: UserMenuItem[];
  level: 2 | 4;
  onCreate?: (ref: RefObject<HTMLButtonElement | null>) => void;
  /** Shown under the heading in place of the tile grid. */
  body?: ReactNode;
}

/** One list of channel tiles, as other tile lists show theirs: a create button while it is empty, its count and a small add button once it holds tiles. */
function ChannelTilesSection({ entityType, title, items, level, onCreate, body }: ChannelTilesSectionProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const resource = t(entityType).toLowerCase();

  if (!items.length) {
    if (!onCreate) return <p className="text-muted-foreground text-sm">{t('c:no_resource_yet', { resource })}</p>;

    return (
      <Button ref={buttonRef} className="self-start max-sm:w-full" variant="plain" onClick={() => onCreate(buttonRef)}>
        <PlusIcon />
        {t('c:create_resource', { resource })}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <TileListHeading title={title} count={items.length} level={level}>
        {onCreate && (
          <Button
            ref={buttonRef}
            className="-mr-2"
            variant="ghost"
            size="sm"
            aria-label={t('c:create_resource', { resource })}
            onClick={() => onCreate(buttonRef)}
          >
            <PlusIcon />
            {t('c:create')}
          </Button>
        )}
      </TileListHeading>
      {body ?? (
        // The role as the meta line: menu rows carry no counts for the default stats
        <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
          {items.map((item) => (
            <ChannelTileCard key={item.id} entity={item}>
              <ChannelTileRow>
                <ChannelTileHeading meta={<span className="truncate text-muted-foreground text-sm">{t(item.membership.role)}</span>} />
              </ChannelTileRow>
            </ChannelTileCard>
          ))}
        </div>
      )}
    </div>
  );
}

function OrganizationBlock({ organization, menu }: { organization: UserMenuItem; menu: UserMenu }) {
  const { t } = useTranslation();
  const headingId = `home-${organization.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <EntityAvatar
          className="size-8"
          type={organization.entityType}
          id={organization.id}
          name={organization.name}
          url={organization.thumbnailUrl}
        />
        <h3 id={headingId} className="truncate font-medium">
          {organization.name}
        </h3>
        <Badge variant="secondary">{t(organization.membership.role)}</Badge>
      </div>
      {organizationSections(organization, menu).map(({ options, items }) => {
        const { createAction } = options;
        return (
          <ChannelTilesSection
            key={options.entityType}
            entityType={options.entityType}
            title={t(options.label)}
            items={sortAndFilterMenu(items, false)}
            level={4}
            onCreate={createAction && ((ref) => createAction(ref, organization.id))}
          />
        );
      })}
    </section>
  );
}

/**
 * Links to the signed-in user's channels: the organizations as one tile list, or as a block each with a tile list per
 * menu section when channels sit below them. Each list creates its channels; managing them stays in the menu.
 */
export function HomeChannels({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { menu, isLoading } = useMenu(userId);

  if (isLoading) return null;

  const organizations = sortAndFilterMenu(menuOrganizations(menu), false);
  const createOrganization = getMenuSection('organization')?.createAction;

  return (
    <div className="mt-6 mb-24 flex flex-col">
      <ChannelTilesSection
        entityType="organization"
        title={t('c:organization_other')}
        items={organizations}
        level={2}
        onCreate={createOrganization}
        body={
          hasChannelsBelowOrganizations ? (
            <div className="mt-2 flex flex-col gap-8">
              {organizations.map((organization) => (
                <OrganizationBlock key={organization.id} organization={organization} menu={menu} />
              ))}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
