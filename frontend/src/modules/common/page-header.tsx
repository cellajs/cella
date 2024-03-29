import { useRef } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Breadcrumb, BreadcrumbItem } from '~/modules/ui/breadcrumb';
import { PageCover } from './page-cover';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string | null;
  type: 'user' | 'organization';
  id: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  panel?: React.ReactNode;
}

// PageHeader Component
const PageHeader = ({ title, id, thumbnailUrl, bannerUrl, type, panel }: PageHeaderProps) => {
  const scrollToRef = useRef<HTMLDivElement>(null);
  // Scroll to page header on load
  useScrollTo(scrollToRef);

  return (
    <div className="relative">
      <PageCover type={type} id={id} url={bannerUrl} />

      <div className="absolute flex bottom-0 w-full bg-background/50 backdrop-blur-sm" ref={scrollToRef}>
        <div className="flex items-stretch">
          <AvatarWrap className="m-2" type={type} id={id} name={title} url={thumbnailUrl} />
          <div className="my-auto">
            {/* Page title */}
            <h1 className="md:text-xl leading-4 md:-mt-1 font-semibold">{title}</h1>

            {/* Breadcrumb */}
            <Breadcrumb className="flex">
              <BreadcrumbItem>
                <strong className="text-sm leading-4 font-light">{type}</strong>
              </BreadcrumbItem>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex ml-auto items-center">{panel}</div>
      </div>
    </div>
  );
};

export { PageHeader };
