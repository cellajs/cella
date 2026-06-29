import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { isValidElement, type ReactElement } from 'react';
import * as Badge from '~/modules/ui/badge';
import * as Button from '~/modules/ui/button';
import * as Card from '~/modules/ui/card';
import * as DropdownMenu from '~/modules/ui/dropdown-menu';
import { DropdownMenuContentNoPortal } from '~/modules/ui/dropdown-menu';
import * as Input from '~/modules/ui/input';
import * as Label from '~/modules/ui/label';
import * as Popover from '~/modules/ui/popover';
import { PopoverContentNoPortal } from '~/modules/ui/popover';
import * as Select from '~/modules/ui/select';
import { SelectContentNoPortal } from '~/modules/ui/select';
import * as Tabs from '~/modules/ui/tabs';
import * as Toggle from '~/modules/ui/toggle';
import * as Tooltip from '~/modules/ui/tooltip';

// BlockNote passes Radix-style `asChild` — translate to Base UI's `render` prop
function BlockNoteDropdownMenuTrigger({
  asChild,
  children,
  ...props
}: MenuPrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild && isValidElement(children)) {
    return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" render={children as ReactElement} {...props} />;
  }
  return (
    <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props}>
      {children}
    </MenuPrimitive.Trigger>
  );
}

function BlockNotePopoverTrigger({
  asChild,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild && isValidElement(children)) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" render={children as ReactElement} {...props} />;
  }
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

function BlockNoteTooltipTrigger({
  asChild,
  children,
  ...props
}: TooltipPrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild && isValidElement(children)) {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" render={children as ReactElement} {...props} />;
  }
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
}

// Ensure compatibility, your ShadCN components should not use Portals (comment these out from your DropdownMenu, Popover and Select components).
// biome-ignore lint/suspicious/noExplicitAny: BlockNote expects Radix-compatible types; our Base UI wrapper types are narrower
export const shadCNComponents: Record<string, any> = {
  Button,
  DropdownMenu: {
    ...DropdownMenu,
    DropdownMenuTrigger: BlockNoteDropdownMenuTrigger,
    DropdownMenuContent: DropdownMenuContentNoPortal,
  },
  Select: {
    ...Select,
    SelectContent: SelectContentNoPortal,
  },
  Popover: {
    ...Popover,
    PopoverTrigger: BlockNotePopoverTrigger,
    PopoverContent: PopoverContentNoPortal,
  },
  Tooltip: {
    ...Tooltip,
    TooltipTrigger: BlockNoteTooltipTrigger,
  },
  Label,
  Input,
  Card,
  Badge,
  Toggle,
  Tabs,
};
