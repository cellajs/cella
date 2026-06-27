import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextEntityBase, MembershipBase, UserBase } from 'sdk';
import { appConfig } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import { Badge } from '~/modules/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '~/modules/ui/breadcrumb';
import { getContextEntityRoute, pageTopHashNav } from '~/utils/context-entity-route';

type PageHeaderProps = Omit<PageCoverProps, 'id' | 'url'> & {
  entity: (ContextEntityBase | UserBase) & { membership?: MembershipBase | null };
  panel?: React.ReactNode;
  parent?: ContextEntityBase;
};

export function PageHeader({ entity, panel, parent, ...coverProps }: PageHeaderProps) {
  const { t } = useTranslation();

  // Use enriched membership from entity data (baked in via cache enrichment)
  const membership = entity.entityType !== 'user' ? (entity.membership ?? null) : null;

  // Get parent route using app-specific resolver (handles hierarchy differences per fork)
  const parentRoute = parent ? getContextEntityRoute(parent) : null;

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
          {/* Page title */}
          <h1 className="mb-1 truncate font-semibold leading-6 md:text-xl">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            {/* Role */}
            {membership && (
              <>
                <Badge variant="plain">{t(membership.role)}</Badge>
                <div className="opacity-70 max-sm:invisible max-sm:w-0">&middot;</div>
              </>
            )}

            {/* Breadcrumb */}
            <Breadcrumb className="max-sm:hidden">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    className="p-0.5 text-foreground/70"
                    render={<Link to={appConfig.defaultRedirectPath} />}
                  >
                    <HomeIcon size={14} />
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-foreground/50">
                  <ChevronRightIcon size={12} />
                </BreadcrumbSeparator>
                {parent && parentRoute && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        className="flex items-center text-foreground/70"
                        render={<Link to={parentRoute.to} params={parentRoute.params} {...pageTopHashNav} />}
                      >
                        <span className="truncate max-sm:max-w-24">{parent.name}</span>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="text-foreground/50">
                      <ChevronRightIcon size={12} />
                    </BreadcrumbSeparator>
                  </>
                )}
                <BreadcrumbItem className="flex items-center text-foreground/70">
                  <span>{entity.entityType}</span>
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
