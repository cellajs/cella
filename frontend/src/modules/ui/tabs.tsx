import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/utils/cn';

const TabsListVariants = cva('inline-flex items-center w-full justify-start', {
  variants: {
    variant: {
      default: 'rounded-lg bg-card border p-1 h-9',
      side: 'flex flex-col h-auto bg-none border-none',
      underline: 'border-b rounded-none bg-background gap-2 p-0 h-9',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const TabsTriggerVariants = cva(
  'inline-flex w-full items-center justify-center whitespace-nowrap text-sm font-normal transition-all disabled:pointer-events-none data-[state=active]:text-foreground p-3 disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'data-[state=active]:bg-background focus-effect data-[state=active]:shadow-xs rounded-md',
        secondary: 'data-[state=active]:bg-secondary focus-effect data-[state=active]:shadow-xs rounded-md',
        underline:
          'bg-none border-b-2 border-none focus:border-primary ring-0 outline-hidden shadow-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none m-0 pt-1.5 pb-2 hover:bg-background-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof TabsListVariants>;

function TabsList({ className, variant, ...props }: TabsListProps) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(TabsListVariants({ variant, className }))} {...props} />;
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> & VariantProps<typeof TabsTriggerVariants>;

function TabsTrigger({ className, variant, ...props }: TabsTriggerProps) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn(TabsTriggerVariants({ variant, className }))} {...props} />;
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
