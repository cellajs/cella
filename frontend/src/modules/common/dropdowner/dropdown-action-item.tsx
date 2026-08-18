import { Menu } from '@base-ui/react/menu';
import type { ReactNode } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface Props {
  isMobile: boolean;
  onSelect?: () => void;
  icon?: IconComponent;
  children: ReactNode;
  variant?: ButtonProps['variant'];
  className?: ButtonProps['className'];
  /**
   * Close the menu after selection (desktop only). Defaults to true; pass false when the item
   * swaps in a confirmation panel via `useDropdowner.update`.
   */
  closeOnSelect?: boolean;
}

export function DropdownActionItem({
  isMobile,
  onSelect,
  icon: Icon,
  children,
  variant = 'secondary',
  className,
  closeOnSelect = true,
}: Props) {
  if (isMobile) {
    return (
      <div className="sm:p-1">
        <Button onClick={onSelect} variant={variant} className={cn('flex w-full items-center', className)}>
          {Icon && <Icon className="mr-2" />}
          {children}
        </Button>
      </div>
    );
  }

  return (
    <Menu.Item
      closeOnClick={closeOnSelect}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-10 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        variant === 'destructive' &&
          'text-destructive data-highlighted:bg-destructive data-highlighted:text-destructive-foreground',
        className,
      )}
    >
      {Icon && <Icon />}
      {children}
    </Menu.Item>
  );
}
