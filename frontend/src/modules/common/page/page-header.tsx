import { Link } from '@tanstack/react-router';
import { type Entity, config } from 'config';
import { ChevronRight, Home, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { PageCover } from '~/modules/common/page/page-cover';
import type { LimitedEntity } from '~/modules/entities/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { baseEntityRoutes } from '~/nav-config';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string | null;
  type: Entity;
  id: string;
  isAdmin: boolean;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  panel?: React.ReactNode;
  parent?: { id: string; fetchFunc: (idOrSlug: string) => Promise<LimitedEntity> };
  disableScroll?: boolean;
  coverUpdateCallback: (bannerUrl: string) => void;
}

// PageHeader Component
const PageHeader = ({ title, id, isAdmin, thumbnailUrl, bannerUrl, type, panel, parent, disableScroll, coverUpdateCallback }: PageHeaderProps) => {
  const [fetchedParent, setFetchedParent] = useState<LimitedEntity | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const scrollToRef = useRef<HTMLDivElement>(null);

  // Scroll to page header on load
  if (!disableScroll) useScrollTo(scrollToRef);

  useEffect(() => {
    if (!parent) return;

    // Define an async function inside the effect
    (async () => {
      try {
        const data = await parent.fetchFunc(parent.id);
        setFetchedParent(data);
        setLoading(false);
      } catch (err) {
        setError(true);
        setLoading(false);
      }
    })();
  }, [parent]);

  return (
    <div className="relative">
      <PageCover id={id} url={bannerUrl} canUpdate={isAdmin} coverUpdateCallback={coverUpdateCallback} />

      <div className="absolute flex bottom-0 w-full h-16 bg-background/50 backdrop-blur-xs px-1 py-1" ref={scrollToRef}>
        <AvatarWrap
          className={type === 'user' ? 'h-24 w-24 -mt-12 text-4xl ml-2 mr-3 border-bg border-opacity-50 border-2 rounded-full' : 'm-2'}
          type={type}
          id={id}
          name={title}
          url={thumbnailUrl}
        />

        <div className="flex py-2 flex-col truncate pl-1">
          {/* Page title */}
          <h1 className="md:text-xl max-sm:-mt-0.5 truncate leading-6 font-semibold">{title}</h1>

          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink className="p-0.5" asChild>
                  <Link to={config.defaultRedirectPath}>
                    <Home size={12} />
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden">
                <ChevronRight size={12} />
              </BreadcrumbSeparator>
              {parent && !error && (
                <>
                  {loading || !fetchedParent ? (
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  ) : (
                    <BreadcrumbItem>
                      <BreadcrumbLink className="flex items-center" asChild>
                        <Link to={baseEntityRoutes[fetchedParent.entity].to} params={{ idOrSlug: fetchedParent.slug }}>
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
                <span>{type}</span>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex ml-auto items-center">{panel}</div>
      </div>
    </div>
  );
};

export { PageHeader };
