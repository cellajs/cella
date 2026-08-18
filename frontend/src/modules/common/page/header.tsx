import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBase, UserBase } from 'sdk';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EnrichedChannel } from '~/modules/entities/types';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '~/modules/ui/breadcrumb';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';

type PageHeaderProps = Omit<PageCoverProps, 'id' | 'url'> & {
  entity: ChannelBase | UserBase;
  panel?: React.ReactNode;
  /** Ancestor crumb chain, root first. Entries must be enriched: crumb routes need `ancestorSlugs`. */
  parents?: EnrichedChannel[];
  /** @deprecated Use `parents`. */
  parent?: EnrichedChannel;
};

/**
 * Page header. Role visibility belongs to the panel's role-labeled membership button.
 */
export function PageHeader({ entity, panel, parents, parent, ...coverProps }: PageHeaderProps) {
  const { t } = useTranslation();

  // Crumb chain, root first; the deprecated single `parent` folds in
  const crumbs = parents ?? (parent ? [parent] : []);

  return (
    <div className="relative w-full">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute bottom-0 flex h-18 w-full bg-background/50 px-1 py-1 backdrop-blur-xs" id="pt">
        <EntityAvatar
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          className={
            entity.entityType === 'user'
              ? 'mx-3 -mt-13 h-26 w-26 rounded-full text-4xl shadow-[0_0_0_4px_rgba(0,0,0,0.1)]'
              : 'm-2 h-12 w-12 text-xl'
          }
        />

        <div className="flex flex-col truncate py-1.5 pl-1">
          <h1 className="mb-1 truncate font-semibold leading-6 md:text-xl">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            <Breadcrumb className="max-sm:hidden">
              <BreadcrumbList>
                {crumbs.map((crumb) => {
                  const crumbRoute = getChannelRoute(crumb);
                  return (
                    <Fragment key={crumb.id}>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          className="flex items-center text-foreground/70"
                          render={<Link to={crumbRoute.to} params={crumbRoute.params} {...pageTopHashNav} />}
                        >
                          <span className="truncate max-sm:max-w-24">{crumb.name}</span>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="text-foreground/50">
                        <ChevronRightIcon className="icon-xs" />
                      </BreadcrumbSeparator>
                    </Fragment>
                  );
                })}
                <BreadcrumbItem className="flex items-center text-foreground/70">
                  <span>{t(`c:${entity.entityType}`).toLowerCase()}</span>
                  {appConfig.mode === 'development' && (
                    <span className="ml-2 text-foreground/40 text-xs max-sm:hidden">{entity.id}</span>
                  )}
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="ml-auto flex items-center">{panel}</div>
      </div>
    </div>
  );
}
