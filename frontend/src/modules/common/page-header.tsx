import { useRef } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '~/modules/ui/breadcrumb';
import { PageCover } from './page-cover';
import type { PageResourceType } from 'backend/types/common';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Home } from 'lucide-react';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string | null;
  type: PageResourceType;
  id: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  panel?: React.ReactNode;
  organizationId?: string;
}

// PageHeader Component
const PageHeader = ({ title, id, thumbnailUrl, bannerUrl, type, panel, organizationId }: PageHeaderProps) => {
  const { t } = useTranslation();
  const scrollToRef = useRef<HTMLDivElement>(null);
  // Scroll to page header on load
  useScrollTo(scrollToRef);

  return (
    <div className="relative">
      <PageCover type={type} id={id} url={bannerUrl} />

      <div className="absolute flex bottom-0 w-full bg-background/50 backdrop-blur-sm px-2 py-1" ref={scrollToRef}>
        <div className="flex items-stretch">
          <AvatarWrap className="m-2" type={type} id={id} name={title} url={thumbnailUrl} />
          <div className="my-auto">
            {/* Page title */}
            <h1 className="md:text-xl !leading-4 font-semibold">{title}</h1>
            {/* Breadcrumb */}

            <Breadcrumb className="mt-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/home"><Home size={12} /></Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight size={12} />
                </BreadcrumbSeparator>
                {!!organizationId && <>
               <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/$idOrSlug/members" params={{idOrSlug: organizationId }}>{t('common:organization').toLowerCase()}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight size={12} />
                </BreadcrumbSeparator>
                </>}
                <BreadcrumbItem>
                  {t(type.toLowerCase()).toLowerCase()}
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
