import type { ComponentProps, ReactNode } from 'react';
import type { EntityType } from 'shared';
import { type AvatarEntity, EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { Chip, type Removable } from '~/modules/ui/chip';
import { cn } from '~/utils/cn';

type EntityChipProps = Omit<ComponentProps<'span'>, 'children'> & {
  entity: AvatarEntity & { entityType: EntityType; name: string };
  /** Shown in place of the image or initials. */
  icon?: IconComponent;
  size?: 'default' | 'lg';
  children?: ReactNode;
  end?: ReactNode;
} & Removable;

/** An entity as a chip that starts with its avatar. */
export function EntityChip({ entity, icon, size, className, children, ...props }: EntityChipProps) {
  const isUser = entity.entityType === 'user';

  return (
    <Chip
      start={
        <EntityAvatar aria-hidden entity={entity} icon={icon} className={cn(size === 'lg' ? 'size-8' : 'size-6', !isUser && 'rounded-r-none')} />
      }
      className={cn(size === 'lg' && 'h-8', !isUser && 'rounded-md', className)}
      {...props}
    >
      {children ?? entity.name}
    </Chip>
  );
}
