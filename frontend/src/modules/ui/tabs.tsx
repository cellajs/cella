import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/utils/cn';

const TabsListVariants = cva('bg-none text-muted-foreground inline-flex h-9 w-full items-center justify-center rounded-lg p-[3px] gap-2', {
  variants: {
    variant: {
      default: '',
      side: 'flex flex-col h-fit w-fit [&>button]:w-full border-none',
      // 'bg-background gap-2 p-0 h-9',
      underline: 'border-b rounded-none pb-2',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof TabsListVariants>;

function TabsList({ className, variant, ...props }: TabsListProps) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(TabsListVariants({ variant, className }))} {...props} />;
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger>;

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className="data-[state=active]:bg-secondary dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
