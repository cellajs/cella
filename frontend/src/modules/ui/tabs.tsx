import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/utils/utils';

const TabsListVariants = cva(' inline-flex items-center w-full justify-start', {
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
  'inline-flex w-full items-center justify-center whitespace-nowrap text-sm font-normal transition-all disabled:pointer-events-none data-[state=active]:text-foreground p-3',
  {
    variants: {
      variant: {
        default:
          'data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:shadow  disabled:opacity-50 rounded-md',
        secondary:
          'data-[state=active]:bg-secondary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:shadow  disabled:opacity-50 rounded-md',
        underline:
          'bg-none border-b-2 border-none focus:border-primary ring-0 outline-none shadow-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary disabled:opacity-100 data-[state=active]:shadow-none rounded-none m-0 pt-1.5 pb-2 hover:bg-background-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Root ref={ref} className={cn('flex rounded-md border-3 border-white text-muted-foreground gap-1', className)} {...props} />
  ),
);
Tabs.displayName = TabsPrimitive.List.displayName;

export interface TabsListProps extends React.ButtonHTMLAttributes<HTMLDivElement>, VariantProps<typeof TabsListVariants> {
  asChild?: boolean;
}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn(TabsListVariants({ variant, className }))} {...props} />
));
TabsList.displayName = TabsPrimitive.List.displayName;

//

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof TabsTriggerVariants> {
  asChild?: boolean;
  value: string;
}

const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, variant, value, ...props }, ref) => (
    <TabsPrimitive.Trigger ref={ref} value={value} className={cn(TabsTriggerVariants({ variant, className }))} {...props} />
  ),
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  ),
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
