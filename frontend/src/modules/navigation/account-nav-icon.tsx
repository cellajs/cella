import { UserIcon } from 'lucide-react';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useUserStore } from '~/modules/user/user-store';

/** Current user's avatar for the account nav button; falls back to the user icon while signed out. */
export function AccountNavIcon({ className }: { className?: string }) {
  const { user } = useUserStore();

  if (!user) return <UserIcon className={className} strokeWidth={1.8} />;

  return (
    <EntityAvatar
      type="user"
      className="-m-0.5 size-7 shrink-0 rounded-full border-[0.1rem] border-primary text-base transition-transform group-hover:scale-110"
      id={user.id}
      name={user.name}
      url={user.thumbnailUrl}
    />
  );
}
