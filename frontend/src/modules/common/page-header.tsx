import { Link } from '@tanstack/react-router';
import type { Entity } from 'backend/types/common';
import { ChevronRight, Home } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { PageCover } from './page-cover';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string | null;
  type: Entity;
  id: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  panel?: React.ReactNode;
  organizationId?: string;
  disableScroll?: boolean;
}

// PageHeader Component
const PageHeader = ({ title, id, thumbnailUrl, bannerUrl, type, panel, organizationId, disableScroll }: PageHeaderProps) => {
  const { t } = useTranslation();
  const scrollToRef = useRef<HTMLDivElement>(null);
  // Scroll to page header on load
  if (!disableScroll) useScrollTo(scrollToRef);

  return (
    <div className="relative">
      <PageCover type={type} id={id} url={bannerUrl} />

      <div className="absolute flex bottom-0 w-full h-16 bg-background/50 backdrop-blur-sm px-1 py-1" ref={scrollToRef}>
        <AvatarWrap
          className={type === 'user' ? 'h-24 w-24 -mt-12 text-2xl ml-2 mr-3 border-bg border-opacity-50 border-2 rounded-full' : 'm-2 mr-3'}
          type={type}
          id={id}
          name={title}
          url={thumbnailUrl}
        />

        <div className="flex my-2 flex-col truncate">
          {/* Page title */}
          <h1 className="md:text-xl -mt-1 truncate leading-6 font-semibold">{title}</h1>
          {/* Breadcrumb */}

          <Breadcrumb className="">
            <BreadcrumbList>
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink asChild>
                  <Link to="/home">
                    <Home size={12} />
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden">
                <ChevronRight size={12} />
              </BreadcrumbSeparator>
              {!!organizationId && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink className="flex items-center" asChild>
                      <Link to="/$idOrSlug/members" params={{ idOrSlug: organizationId }}>
                        <span>{t('common:organization').toLowerCase()}</span>
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
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
