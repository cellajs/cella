import { Link } from '@tanstack/react-router';
import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { numberToColorClass } from '~/utils/number-to-color-class';
import { AvatarWrap } from '../common/avatar-wrap';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '../ui/avatar';

export const mockEntities = Array.from({ length: 19 }).map((_, i) => ({
  id: `${i + 1}_id`,
  slug: `project-${i + 1}`,
  name: `Project ${i + 1}`,
  description: `This is a mock description for project ${i + 1}.`,
  bannerUrl: '',
  thumbnailUrl: `https://i.pravatar.cc/150?img=${i % 70}`,
  members: Array.from({ length: Math.floor(Math.random() * 5) + 1 }).map((_, j) => ({
    id: `${i + 1}-${j + 1}`,
    name: `User ${j + 1}`,
    thumbnailUrl: `https://i.pravatar.cc/150?img=${(i + j) % 70}`,
  })),
}));

export const EntityTile = ({ entity }: { entity: (typeof mockEntities)[0] }) => {
  return (
    <Card className="overflow-hidden shadow-md transition hover:shadow-lg">
      <CardContent className="p-4">
        <Link to="/$idOrSlug" params={{ idOrSlug: entity.slug }} className="w-full relative group">
          <div
            className={`relative flex flex-col -mx-4 -mt-6 bg-cover bg-center aspect-[3/1] bg-opacity-80 ${
              entity.bannerUrl ? '' : numberToColorClass(entity.id)
            }`}
            style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
          >
            <div className="grow" />
            <div className="flex w-full items-center backdrop-blur-xs gap-3 px-4 py-2 bg-background/40 group-hover:bg-background/60 transition-colors">
              <AvatarWrap className="h-10 w-10" type="organization" id={entity.id} name={entity.name} url={entity.thumbnailUrl} />
              <div className="flex flex-col grow gap-1">
                <div className="font-semibold leading-3">{entity.name}</div>
                <div className="text-sm font-light opacity-70 group-hover:opacity-85 transition-opacity">10 years | 0 Followers</div>
              </div>
            </div>
          </div>
        </Link>

        <p className="text-sm opacity-70 pt-3 line-clamp-2">{entity.description}</p>

        <div className="flex items-center justify-stretch gap-2 pt-3">
          <Button variant="outlinePrimary">Owner</Button>
          <AvatarGroup limit={3}>
            <AvatarGroupList>
              {entity.members.map((user) => (
                <AvatarWrap type="user" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-8 w-8 text-xs" />
              ))}
            </AvatarGroupList>
            <AvatarOverflowIndicator className="h-8 w-8 text-xs" />
          </AvatarGroup>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * This is a placeholder component for the user profile page content
 **/
const ProfilePageContent = ({ sheet, userId, orgIdOrSlug }: { userId: string; orgIdOrSlug?: string; sheet?: boolean }) => {
  // Log props to prevent code style issues
  console.info('ProfilePageContent', { userId, sheet, orgIdOrSlug });

  // Don't render anything until `orgId` is available
  if (!orgIdOrSlug)
    return (
      <div className="mt-6 mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        {mockEntities.map((entity) => (
          <EntityTile key={entity.id} entity={entity} />
        ))}
      </div>
    );

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
