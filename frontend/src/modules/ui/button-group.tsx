import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { Separator } from '~/modules/ui/separator';
import { cn } from '~/utils/cn';

export const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal: '*:not-first:rounded-l-none *:not-first:border-l-0 *:not-last:rounded-r-none',
        vertical: 'flex-col *:not-first:rounded-t-none *:not-first:border-t-0 *:not-last:rounded-b-none',
      },
    },
    defaultVariants: { orientation: 'horizontal' },
  },
);

export function ButtonGroup({ className, orientation, ...props }: React.ComponentProps<'div'> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

export function ButtonGroupText({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: {
      className: cn(
        "border-input bg-muted flex items-center gap-2 rounded-md border px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      ),
      ...props,
    },
  });
}

export function ButtonGroupSeparator({ className, orientation = 'vertical', ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn('bg-input relative self-stretch data-vertical:h-auto', className)}
      {...props}
    />
  );
}
