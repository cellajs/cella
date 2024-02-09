import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Breadcrumb, BreadcrumbItem } from '~/modules/ui/breadcrumb';
import { PageCover } from './page-cover';
import { useRef } from 'react';
import useScrollTo from '~/hooks/use-scroll-to';

// PageHeaderProps Interface
interface PageHeaderProps {
  title?: string;
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
            <h1 className="text-xl leading-5 font-semibold">{title}</h1>

            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbItem>
                <strong className="text-sm font-light">{type}</strong>
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
