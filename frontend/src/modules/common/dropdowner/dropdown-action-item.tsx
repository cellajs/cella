import type { ReactNode } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface DropdownActionItemProps {
  /** Renders the drawer row; defaults to the breakpoint at which the dropdowner renders a drawer. */
  isMobile?: boolean;
  onSelect?: () => void;
  icon?: IconComponent;
  children: ReactNode;
  variant?: ButtonProps['variant'];
  className?: ButtonProps['className'];
  /** Close the menu after selection (desktop only, default true); false for an item that opens a confirmation (`openPopConfirm`). */
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
}: DropdownActionItemProps) {
  const isDrawer = useBreakpointBelow('sm');

  if (isMobile ?? isDrawer) {
    return (
      <Button onClick={onSelect} variant={variant} className={cn('flex w-full', className)}>
        {Icon && <Icon />}
        {children}
      </Button>
    );
  }

  return (
    <DropdownMenuItem
      variant={variant === 'destructive' ? 'destructive' : 'default'}
      closeOnClick={closeOnSelect}
      onClick={onSelect}
      className={className}
    >
      {Icon && <Icon />}
      {children}
    </DropdownMenuItem>
  );
}
