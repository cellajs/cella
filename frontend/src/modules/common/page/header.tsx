import * as Sentry from '@sentry/react';
import { Link } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ChevronRight, Home, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { PageCover, type PageCoverProps } from '~/modules/common/page/cover';
import type { EntityPage, EntitySummary } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import type { UserSummary } from '~/modules/users/types';
import { baseEntityRoutes } from '~/nav-config';

type PageHeaderProps = Omit<PageCoverProps, 'id' | 'url'> & {
  entity: EntityPage | UserSummary;
  panel?: React.ReactNode;
  parent?: { id: string; fetchFunc: (idOrSlug: string) => Promise<EntitySummary> };
  disableScroll?: boolean;
};

const PageHeader = ({ entity, panel, parent, disableScroll, ...coverProps }: PageHeaderProps) => {
  const [fetchedParent, setFetchedParent] = useState<EntitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const scrollToRef = useRef<HTMLDivElement>(null);

  // Scroll to page header on load
  if (!disableScroll) useScrollTo(scrollToRef);

  // Fetch parent entity details if `parent` prop is provided
  useEffect(() => {
    if (!parent) return;

    // Define an async function inside the effect
    (async () => {
      try {
        const data = await parent.fetchFunc(parent.id);
        setFetchedParent(data);
        setLoading(false);
      } catch (err) {
        Sentry.captureException(err);
        setError(true);
        setLoading(false);
      }
    })();
  }, [parent]);

  return (
    <div className="relative">
      <PageCover id={entity.id} url={entity.bannerUrl} {...coverProps} />

      <div className="absolute flex bottom-0 w-full h-18 bg-background/50 backdrop-blur-xs px-1 py-1" ref={scrollToRef}>
        <AvatarWrap
          id={entity.id}
          name={entity.name}
          type={entity.entityType}
          url={entity.thumbnailUrl}
          className={
            entity.entityType === 'user'
              ? 'h-26 w-26 -mt-12 text-4xl ml-2 mr-3 border-bg border-opacity-50 border-2 rounded-full'
              : 'm-2 text-xl h-12 w-12'
          }
        />

        <div className="flex py-1.5 flex-col truncate pl-1">
          {/* Page title */}
          <h1 className="md:text-xl truncate font-semibold leading-6 mb-1">{entity.name}</h1>

          <div className="flex items-center gap-2 text-sm">
            {/* Role */}
            {'membership' in entity && entity.membership && (
              <>
                <Badge className="opacity-70" variant="plain">
                  {entity.membership.role}
                </Badge>
                <div className="opacity-70 max-sm:hidden">&middot;</div>
              </>
            )}

            {/* Breadcrumb */}
            <Breadcrumb className="max-sm:hidden">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink className="p-0.5" asChild>
                    <Link to={appConfig.defaultRedirectPath}>
                      <Home size={12} />
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight size={12} />
                </BreadcrumbSeparator>
                {parent && !error && (
                  <>
                    {loading || !fetchedParent ? (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    ) : (
                      <BreadcrumbItem>
                        <BreadcrumbLink className="flex items-center" asChild>
                          <Link to={baseEntityRoutes[fetchedParent.entityType].to} params={{ idOrSlug: fetchedParent.slug }}>
                            <span className="truncate max-sm:max-w-24">{fetchedParent.name}</span>
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    )}
                    <BreadcrumbSeparator>
                      <ChevronRight size={12} />
                    </BreadcrumbSeparator>
                  </>
                )}
                <BreadcrumbItem className="flex items-center">
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
