import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '~/utils/cn';

const TabsListVariants = cva(
  'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-none p-[3px] text-muted-foreground',
  {
    variants: {
      variant: {
        default: '',
        side: 'flex h-fit w-fit flex-col border-none [&>button]:w-full',
        // 'bg-background gap-2 p-0 h-9',
        underline: 'rounded-none border-b pb-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof TabsListVariants>;

export function TabsList({ className, variant, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List data-slot="tabs-list" className={cn(TabsListVariants({ variant, className }))} {...props} />
  );
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Tab>;

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className="inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-foreground text-sm transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:pointer-events-none data-selected:bg-secondary data-disabled:opacity-50 data-selected:shadow-sm dark:text-muted-foreground dark:data-selected:border-input dark:data-selected:bg-input/30 dark:data-selected:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}
