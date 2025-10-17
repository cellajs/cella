import { Link } from '@tanstack/react-router';
import { appConfig, ContextEntityType } from 'config';
import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBaseSchema } from '~/api.gen';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EntityPage } from '~/modules/entities/types';
import { useGetEntityBaseData } from '~/modules/entities/use-get-entity-base-data';
import { Badge } from '~/modules/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { baseEntityRoutes } from '~/routes-config';

type PageHeaderProps = Omit<PageCoverProps, 'id' | 'url'> & {
  entity: EntityPage | UserBaseSchema;
  panel?: React.ReactNode;
  parent?: { idOrSlug: string; entityType: ContextEntityType | 'user' };
  disableScroll?: boolean;
};

const PageHeader = ({ entity, panel, parent, disableScroll, ...coverProps }: PageHeaderProps) => {
  const { t } = useTranslation();

  const scrollToRef = useRef<HTMLDivElement>(null);

  const parentData = parent ? useGetEntityBaseData(parent) : null;
  // Scroll to page header on load
  if (!disableScroll) useScrollTo(scrollToRef);

  return (
    <div className="w-full relative">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute flex bottom-0 w-full h-18 bg-background/50 backdrop-blur-xs px-1 py-1" ref={scrollToRef}>
        <AvatarWrap
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          className={
            entity.entityType === 'user' ? 'h-26 w-26 -mt-13 text-4xl mx-3 shadow-[0_0_0_4px_rgba(0,0,0,0.1)] rounded-full' : 'm-2 text-xl h-12 w-12'
          }
        />

        <div className="flex py-1.5 flex-col truncate pl-1">
          {/* Page title */}
          <h1 className="md:text-xl truncate font-semibold leading-6 mb-1">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            {/* Role */}
            {'membership' in entity && entity.membership && (
              <>
                <Badge variant="plain">{t(entity.membership.role, { ns: ['app', 'common'] })}</Badge>
                <div className="opacity-70 max-sm:hidden">&middot;</div>
              </>
            )}

            {/* Breadcrumb */}
            <Breadcrumb className="max-sm:hidden">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink className="p-0.5 text-foreground/70" asChild>
                    <Link to={appConfig.defaultRedirectPath}>
                      <HomeIcon size={14} />
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-foreground/50">
                  <ChevronRightIcon size={12} />
                </BreadcrumbSeparator>
                {parentData && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink className="flex items-center text-foreground/70" asChild>
                        <Link to={baseEntityRoutes[parentData.entityType]} params={{ idOrSlug: parentData.slug }}>
                          <span className="truncate max-sm:max-w-24">{parentData.name}</span>
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="text-foreground/50">
                      <ChevronRightIcon size={12} />
                    </BreadcrumbSeparator>
                  </>
                )}
                <BreadcrumbItem className="flex items-center text-foreground/70">
                  <span>{entity.entityType}</span>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex ml-auto items-center">{panel}</div>
      </div>
    </div>
  );
};

export { PageHeader };
