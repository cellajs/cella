import { memo } from 'react';
import type { EntityType } from 'shared';
import { getInitials } from 'shared/utils/get-initials';
import type { IconComponent } from '~/modules/common/icons/types';
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';
import { placeholderColorClass } from '~/utils/placeholder-color-class';

/** The fields of an entity row that its avatar draws; a row passes whole. */
export type AvatarEntity = { id?: string; entityType?: EntityType; name?: string | null; thumbnailUrl?: string | null };

export interface EntityAvatarProps extends AvatarProps {
  entity?: AvatarEntity;
  className?: string;
  icon?: IconComponent;
}

export const EntityAvatar = memo(function EntityAvatar({ entity = {}, icon: Icon, className, ...props }: EntityAvatarProps) {
  const { id, entityType, name, thumbnailUrl } = entity;
  if (Icon)
    return (
      <Avatar
        {...props}
        data-type={entityType}
        className={cn('bg-background items-center justify-center rounded-md data-[type=user]:rounded-full', className)}
      >
        <Icon className="fill-accent size-[70%] opacity-70" />
      </Avatar>
    );

  const avatarBackground = placeholderColorClass(id);
  const [initial, secondInitial] = getInitials(name);
  const isUser = entityType === 'user';

  return (
    <Avatar {...props} data-type={entityType} className={cn('rounded-md data-[type=user]:rounded-full', className)}>
      {thumbnailUrl && <AvatarImage src={thumbnailUrl} alt={name ?? ''} draggable={false} className="transition-[filter]" />}
      {/* The fallback is the container, so the letters scale with the avatar; a user's two letters at every size, bolder below size-6 and a step smaller above it */}
      <AvatarFallback className={cn('@container transition-colors', avatarBackground)}>
        <span className="sr-only">{name}</span>
        {/* Trimmed to cap height and baseline, so the fallback centers the letters: Inter's line box sits them about 1px high */}
        <span
          aria-hidden
          className={cn(
            'more-contrast:text-black/85 text-[50cqi] leading-none font-semibold text-black/50 transition-colors [text-box:trim-both_cap_alphabetic]',
            isUser && '@max-[1.5rem]:font-bold @min-[calc(1.5rem+1px)]:text-[40cqi]',
          )}
        >
          {initial ?? '-'}
          {isUser && secondInitial}
        </span>
      </AvatarFallback>
    </Avatar>
  );
});
