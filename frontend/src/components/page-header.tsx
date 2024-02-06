import { AvatarWrap } from '~/components/avatar-wrap';
import { Breadcrumb, BreadcrumbItem } from '~/components/ui/breadcrumb';

// PageHeaderProps Interface
interface PageHeaderProps {
  title: string;
  type: 'user' | 'organization';
  avatar?: {
    id: string;
    thumbnailUrl?: string | null;
    name: string;
  };
  bannerUrl?: string | null;
  panel?: React.ReactNode;
}

// PageHeader Component
const PageHeader = ({ title, avatar, bannerUrl, type, panel }: PageHeaderProps) => {
  const bannerHeight = bannerUrl ? 'h-[20vw] min-h-[160px] md:min-h-[210px]' : 'h-28';

  return (
    <div className="relative">
      {/* Banner */}
      <div className={`bg-gray-400/25 bg-cover bg-center ${bannerHeight}`} style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : {}} />
      <div className="absolute flex bottom-0 w-full bg-background/50 backdrop-blur-sm">
        <div className="flex items-stretch">
          {avatar && <AvatarWrap className="m-2" type={type} id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
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
