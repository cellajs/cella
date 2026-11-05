import { memo } from 'react';
import type { EntityType } from 'shared';
import { getInitials } from 'shared/utils/get-initials';
import type { IconComponent } from '~/modules/common/icons/types';
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';
import { placeholderColorClass } from '~/utils/placeholder-color-class';

export interface EntityAvatarProps extends AvatarProps {
  id?: string;
  type?: EntityType;
  name?: string | null;
  url?: string | null;
  className?: string;
  icon?: IconComponent;
}

export const EntityAvatar = memo(function EntityAvatar({ type, id, name, icon: Icon, url, className, ...props }: EntityAvatarProps) {
  if (Icon)
    return (
      <Avatar
        {...props}
        data-type={type}
        className={cn('bg-background items-center justify-center rounded-md data-[type=user]:rounded-full', className)}
      >
        <Icon className="fill-accent size-[70%] opacity-70" />
      </Avatar>
    );

  const avatarBackground = placeholderColorClass(id);
  const [initial, secondInitial] = getInitials(name);
  const isUser = type === 'user';

  return (
    <Avatar {...props} data-type={type} className={cn('rounded-md data-[type=user]:rounded-full', className)}>
      {url && <AvatarImage src={url} alt={name ?? ''} draggable={false} className="transition-[filter]" />}
      {/* The fallback is the container, so the letters scale with the avatar; a user's two letters at every size, bolder below size-6 and a step smaller above it */}
      <AvatarFallback className={cn('@container transition-colors', avatarBackground)}>
        <span className="sr-only">{name}</span>
        <div
          aria-hidden
          className={cn(
            'more-contrast:text-black/85 flex h-full items-center justify-center text-[50cqi] leading-none font-semibold text-black/50 transition-colors',
            isUser && '@max-[1.5rem]:font-bold @min-[calc(1.5rem+1px)]:text-[40cqi]',
          )}
        >
          {initial ?? '-'}
          {isUser && secondInitial}
        </div>
      </AvatarFallback>
    </Avatar>
  );
});
