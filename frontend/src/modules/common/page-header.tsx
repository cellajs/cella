import { Link } from '@tanstack/react-router';
import type { Entity } from 'backend/types/common';
import { config } from 'config';
import { ChevronRight, Home, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { PageCover } from '~/modules/common/page-cover';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { baseEntityRoutes } from '~/nav-config';
import type { MinimumEntityItem } from '~/types/common';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string | null;
  type: Entity;
  id: string;
  isAdmin: boolean;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  panel?: React.ReactNode;
  parent?: { id: string; fetchFunc: (idOrSlug: string) => Promise<MinimumEntityItem> };
  disableScroll?: boolean;
}

// PageHeader Component
const PageHeader = ({ title, id, isAdmin, thumbnailUrl, bannerUrl, type, panel, parent, disableScroll }: PageHeaderProps) => {
  const [fetchedParent, setFetchedParent] = useState<MinimumEntityItem | null>(null);
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
      <PageCover type={type} id={id} url={bannerUrl} canUpdate={isAdmin} />

      <div className="absolute flex bottom-0 w-full h-16 bg-background/50 backdrop-blur-sm px-1 py-1" ref={scrollToRef}>
        <AvatarWrap
          className={type === 'user' ? 'h-24 w-24 -mt-12 text-2xl ml-2 mr-3 border-bg border-opacity-50 border-2 rounded-full' : 'm-2'}
          type={type}
          id={id}
          name={title}
          url={thumbnailUrl}
        />

        <div className="flex py-2 flex-col truncate pl-1">
          {/* Page title */}
          <h1 className="md:text-xl -mt-1 truncate leading-6 font-semibold">{title}</h1>

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
                        <Link to={baseEntityRoutes[fetchedParent.entity]} params={{ idOrSlug: fetchedParent.slug }}>
                          <span>{fetchedParent.name}</span>
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
