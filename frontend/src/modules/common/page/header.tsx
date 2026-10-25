import { Link } from '@tanstack/react-router';
import { HouseIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase, UserBase } from 'sdk';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';

interface PageHeaderProps extends Omit<PageCoverProps, 'id' | 'url'> {
  entity: ChannelBase | UserBase;
  /** Controls at the header's end; the viewer's role shows on the membership button placed here, not in the header. */
  panel?: ReactNode;
  /** Takes the place of the crumb row below the name, for an entity that sits in no hierarchy. */
  subline?: ReactNode;
  /** Ancestor crumb chain, root first. Entries must be enriched: crumb routes need `ancestorSlugs`. */
  parents?: EnrichedChannel[];
  /** @deprecated Use `parents`. */
  parent?: EnrichedChannel;
}

export function PageHeader({ entity, panel, subline, parents, parent, ...coverProps }: PageHeaderProps) {
  const { t } = useTranslation();

  // Crumb chain, root first; the deprecated single `parent` folds in
  const crumbs = parents ?? (parent ? [parent] : []);

  return (
    <div className="relative w-full">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute bottom-0 flex min-h-18 w-full bg-background/50 p-1 backdrop-blur-xs dark:bg-background/75" id={pageTopHashNav.hash}>
        <EntityAvatar
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          className={entity.entityType === 'user' ? 'mx-3 -mt-13 size-26 ring-4 ring-black/10' : 'm-2 size-12'}
        />

        <div className="flex flex-col truncate py-1.5 pl-1">
          <h1 className="mb-1 font-semibold leading-6 max-sm:line-clamp-2 max-sm:whitespace-normal sm:truncate md:text-xl">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            {subline ?? (
              // Phones show the type label only: the links and their separators start at sm
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="max-sm:hidden">
                    <BreadcrumbLink className="focus-inset -m-1 flex items-center p-1" render={<Link to="/home" draggable={false} />}>
                      <HouseIcon className="size-3.5" />
                      <span className="sr-only">{t('c:home')}</span>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-muted-foreground/70 max-sm:hidden" />
                  {crumbs.map((crumb) => {
                    const crumbRoute = getChannelRoute(crumb);
                    return (
                      <Fragment key={crumb.id}>
                        <BreadcrumbItem className="max-sm:hidden">
                          <BreadcrumbLink
                            className="flex items-center"
                            render={<Link to={crumbRoute.to} params={crumbRoute.params} {...pageTopHashNav} draggable={false} />}
                          >
                            <span className="truncate">{crumb.name}</span>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="text-muted-foreground/70 max-sm:hidden" />
                      </Fragment>
                    );
                  })}
                  <BreadcrumbItem>
                    <span>{t(`c:${entity.entityType}`).toLowerCase()}</span>
                    {appConfig.mode === 'development' && <span className="ml-2 text-xs max-sm:hidden">{entity.id}</span>}
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
