import type { LucideIcon } from 'lucide-react';
import { memo } from 'react';
import type { EntityType } from 'shared';
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';
import { numberToColorClass } from '~/utils/number-to-color-class';

export interface EntityAvatarProps extends AvatarProps {
  id?: string;
  type?: EntityType;
  name?: string | null;
  url?: string | null;
  className?: string;
  icon?: LucideIcon;
}

function EntityAvatarBase({ type, id, name, icon: Icon, url, className, ...props }: EntityAvatarProps) {
  if (Icon)
    return (
      <Avatar
        {...props}
        className={cn(
          'group flex items-center justify-center overflow-hidden rounded-md bg-background data-[type=user]:rounded-full',
          className,
        )}
      >
        <Icon className="size-[70%] fill-accent opacity-70" strokeWidth={1.5} />
      </Avatar>
    );

  const avatarBackground = numberToColorClass(id);

  return (
    <Avatar
      {...props}
      data-type={type}
      className={cn('group overflow-hidden rounded-md data-[type=user]:rounded-full', className)}
    >
      {url && <AvatarImage src={url} draggable={false} />}
      <AvatarFallback className={avatarBackground}>
        <span className="sr-only">{name}</span>
        <div className="flex h-full items-center justify-center font-semibold text-black uppercase opacity-40">
          {name?.charAt(0).toUpperCase() || '-'}
        </div>
      </AvatarFallback>
    </Avatar>
  );
}

export const EntityAvatar = memo(EntityAvatarBase);
