import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { navIconStrokeWidth } from '~/modules/navigation/nav-buttons';
import { useUserStore } from '~/modules/user/user-store';

export function AccountNavIcon({ className, icon: Icon }: { className?: string; icon: IconComponent }) {
  const user = useUserStore((state) => state.user);

  if (!user) return <Icon className={className} strokeWidth={navIconStrokeWidth} />;

  return (
    <EntityAvatar
      type="user"
      className="-m-0.5 size-7 border-[0.1rem] border-current transition-transform group-hover:scale-110"
      id={user.id}
      name={user.name}
      url={user.thumbnailUrl}
    />
  );
}
