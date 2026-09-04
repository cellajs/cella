import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { useUserStore } from '~/modules/user/user-store';

export function AccountNavIcon({ className, icon: Icon }: { className?: string; icon: IconComponent }) {
  const { user } = useUserStore();

  if (!user) return <Icon className={className} strokeWidth={1.8} />;

  return (
    <EntityAvatar
      type="user"
      className="-m-0.5 size-7 shrink-0 rounded-full border-[0.1rem] border-current text-base transition-transform group-hover:scale-110"
      id={user.id}
      name={user.name}
      url={user.thumbnailUrl}
    />
  );
}
