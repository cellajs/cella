import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, HouseIcon } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase, UserBase } from 'sdk';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';

type PageHeaderProps = Omit<PageCoverProps, 'id' | 'url'> & {
  entity: ChannelBase | UserBase;
  panel?: React.ReactNode;
  /** Takes the place of the crumb row below the name, for an entity that sits in no hierarchy. */
  subline?: React.ReactNode;
  /** Ancestor crumb chain, root first. Entries must be enriched: crumb routes need `ancestorSlugs`. */
  parents?: EnrichedChannel[];
  /** @deprecated Use `parents`. */
  parent?: EnrichedChannel;
};

/**
 * Page header. Role visibility belongs to the panel's role-labeled membership button.
 */
export function PageHeader({ entity, panel, subline, parents, parent, ...coverProps }: PageHeaderProps) {
  const { t } = useTranslation();

  // Crumb chain, root first; the deprecated single `parent` folds in
  const crumbs = parents ?? (parent ? [parent] : []);

  return (
    <div className="relative w-full">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute bottom-0 flex min-h-18 w-full bg-background/50 px-1 py-1 backdrop-blur-xs dark:bg-background/75" id="pt">
        <EntityAvatar
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          className={entity.entityType === 'user' ? 'mx-3 -mt-13 size-26 rounded-full shadow-[0_0_0_4px_rgba(0,0,0,0.1)]' : 'm-2 size-12'}
        />

        <div className="flex flex-col truncate py-1.5 pl-1">
          <h1 className="mb-1 font-semibold leading-6 max-sm:line-clamp-2 max-sm:whitespace-normal sm:truncate md:text-xl">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            {subline ?? (
              // Phones show the type label only: the links and their separators start at sm
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="max-sm:hidden">
                    <BreadcrumbLink className="focus-inset -m-1 flex items-center p-1 text-muted-foreground" render={<Link to="/home" />}>
                      <HouseIcon className="size-3.5" />
                      <span className="sr-only">{t('c:home')}</span>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-muted-foreground/70 max-sm:hidden">
                    <ChevronRightIcon className="size-3" />
                  </BreadcrumbSeparator>
                  {crumbs.map((crumb) => {
                    const crumbRoute = getChannelRoute(crumb);
                    return (
                      <Fragment key={crumb.id}>
                        <BreadcrumbItem className="max-sm:hidden">
                          <BreadcrumbLink
                            className="flex items-center text-muted-foreground"
                            render={<Link to={crumbRoute.to} params={crumbRoute.params} {...pageTopHashNav} />}
                          >
                            <span className="truncate">{crumb.name}</span>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="text-muted-foreground/70 max-sm:hidden">
                          <ChevronRightIcon className="size-3" />
                        </BreadcrumbSeparator>
                      </Fragment>
                    );
                  })}
                  <BreadcrumbItem className="flex items-center text-muted-foreground">
                    <span>{t(`c:${entity.entityType}`).toLowerCase()}</span>
                    {appConfig.mode === 'development' && <span className="ml-2 text-muted-foreground text-xs max-sm:hidden">{entity.id}</span>}
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center">{panel}</div>
      </div>
    </div>
  );
}
