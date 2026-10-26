import { PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { EntityAvatar } from '~/modules/common/entity-avatar';
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

// The role as the meta line: menu rows carry no counts for the default stats
function ChannelTiles({ items }: { items: UserMenuItem[] }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
      {items.map((item) => (
        <ChannelTileCard key={item.id} entity={item}>
          <ChannelTileRow>
            <ChannelTileHeading meta={<span className="truncate text-muted-foreground text-sm">{t(item.membership.role)}</span>} />
          </ChannelTileRow>
        </ChannelTileCard>
      ))}
    </div>
  );
}

function OrganizationBlock({ organization, menu }: { organization: UserMenuItem; menu: UserMenu }) {
  const { t } = useTranslation();
  const sections = organizationSections(organization, menu).map(({ options, items }) => ({ options, items: sortAndFilterMenu(items, false) }));
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
      {sections.map(({ options, items }) => (
        <div key={options.entityType} className="flex flex-col gap-2">
          {sections.length > 1 && <h4 className="text-muted-foreground text-sm">{t(options.label)}</h4>}
          {items.length ? (
            <ChannelTiles items={items} />
          ) : (
            <p className="text-muted-foreground text-sm">{t('c:no_resource_yet', { resource: t(options.label).toLowerCase() })}</p>
          )}
        </div>
      ))}
    </section>
  );
}

/**
 * Links to the signed-in user's channels: a block per organization with its channels as tiles, or organization tiles
 * when nothing sits below organizations. Creating channels and managing them stay in the menu; only a new organization
 * starts here, since a menu per organization has nowhere else for it.
 */
export function HomeChannels({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const { menu, isLoading } = useMenu(userId);
  const createOrganization = getMenuSection('organization')?.createAction;

  if (isLoading) return null;

  const organizations = sortAndFilterMenu(menuOrganizations(menu), false);

  return (
    <section aria-labelledby="home-channels" className="mt-6 mb-24 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h2 id="home-channels" className="grow font-semibold text-lg">
          {t('c:organization_other')}
        </h2>
        {createOrganization && (
          <Button ref={createButtonRef} variant="plain" onClick={() => createOrganization(createButtonRef)}>
            <PlusIcon />
            {t('c:create_resource', { resource: t('c:organization').toLowerCase() })}
          </Button>
        )}
      </div>
      {hasChannelsBelowOrganizations ? (
        organizations.map((organization) => <OrganizationBlock key={organization.id} organization={organization} menu={menu} />)
      ) : (
        <ChannelTiles items={organizations} />
      )}
    </section>
  );
}
