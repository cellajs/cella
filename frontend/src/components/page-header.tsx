import { AvatarWrap } from '~/components/avatar-wrap';

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
      <div className={`bg-gray-400/25 bg-cover bg-center ${bannerHeight}`} style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : {}} />
      <div className="absolute flex bottom-0 w-full bg-background/50 backdrop-blur-sm">
        <div className="flex items-stretch">
          {avatar && <AvatarWrap className="m-2" type={type} id={avatar.id} name={avatar.name} url={avatar.thumbnailUrl} />}
          <div className="my-auto">
            <h1 className="text-xl leading-5 font-semibold">{title}</h1>
            <strong className="text-sm font-light">{type}</strong>
          </div>
        </div>
        <div className="flex ml-auto items-center">{panel}</div>
      </div>
    </div>
  );
};

export { PageHeader };
