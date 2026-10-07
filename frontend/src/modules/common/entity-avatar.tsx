import { memo } from 'react';
import type { EntityType } from 'shared';
import { getInitials } from 'shared/utils/get-initials';
import type { IconComponent } from '~/modules/common/icons/types';
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';
import { numberToColorClass } from '~/utils/number-to-color-class';

export interface EntityAvatarProps extends AvatarProps {
  id?: string;
  type?: EntityType;
  name?: string | null;
  url?: string | null;
  className?: string;
  icon?: IconComponent;
}

function EntityAvatarBase({ type, id, name, icon: Icon, url, className, ...props }: EntityAvatarProps) {
  if (Icon)
    return (
      <Avatar
        {...props}
        className={cn('flex items-center justify-center overflow-hidden rounded-md bg-background data-[type=user]:rounded-full', className)}
      >
        <Icon className="size-[70%] fill-accent opacity-70" strokeWidth={1.5} />
      </Avatar>
    );

  const avatarBackground = numberToColorClass(id);
  const [initial, secondInitial] = getInitials(name);

  return (
    <Avatar {...props} data-type={type} className={cn('overflow-hidden rounded-md data-[type=user]:rounded-full', className)}>
      {url && <AvatarImage src={url} alt={name ?? ''} draggable={false} />}
      {/* The fallback is the container: letters scale with the avatar, and the second one shows when it is wider than size-6 */}
      <AvatarFallback className={cn('@container', avatarBackground)}>
        <span className="sr-only">{name}</span>
        <div
          aria-hidden
          className="flex h-full items-center justify-center font-semibold @min-[calc(1.5rem+1px)]:text-[40cqi] text-[50cqi] text-black leading-none more-contrast:opacity-85 opacity-50"
        >
          {initial ?? '-'}
          {secondInitial && <span className="@min-[calc(1.5rem+1px)]:inline hidden">{secondInitial}</span>}
        </div>
      </AvatarFallback>
    </Avatar>
  );
}

export const EntityAvatar = memo(EntityAvatarBase);
