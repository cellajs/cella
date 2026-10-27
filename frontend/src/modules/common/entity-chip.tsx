import type { ComponentProps, ReactNode } from 'react';
import type { EntityType } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { Chip, type Removable } from '~/modules/ui/chip';
import { cn } from '~/utils/cn';

type EntityChipProps = Omit<ComponentProps<'span'>, 'children'> & {
  type: EntityType;
  id?: string;
  name: string;
  url?: string | null;
  /** Shown in place of the image or initials, as the menu shows a workspace. */
  icon?: IconComponent;
  size?: 'default' | 'lg';
  /** Text in place of the name, such as a sentence that names the entity. */
  children?: ReactNode;
  end?: ReactNode;
} & Removable;

/** An entity as a chip that starts with its avatar. A user's chip is a pill like its avatar, any other entity's has rounded corners. */
export function EntityChip({ type, id, name, url, icon, size = 'default', className, children, ...props }: EntityChipProps) {
  const isUser = type === 'user';

  return (
    <Chip
      start={
        <EntityAvatar
          aria-hidden
          type={type}
          id={id}
          name={name}
          url={url}
          icon={icon}
          className={cn(size === 'lg' ? 'size-8' : 'size-6', !isUser && 'rounded-r-none')}
        />
      }
      className={cn(size === 'lg' && 'h-8', !isUser && 'rounded-md', className)}
      {...props}
    >
      {children ?? name}
    </Chip>
  );
}
