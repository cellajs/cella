import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '~/lib/utils';

const TabsListVariants = cva(' inline-flex items-center w-full justify-start h-9', {
  variants: {
    variant: {
      default: 'rounded-lg bg-card border p-1',
      side: 'flex flex-col h-auto bg-none border-none',
      underline: 'border-b rounded-none bg-background gap-2 p-0',
    },
    size: {
      default: 'h-9',
      sm: 'h-8 text-xs',
      lg: 'h-10',
      icon: 'h-9 w-9',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

const TabsTriggerVariants = cva(
  'inline-flex w-full items-center justify-center whitespace-nowrap text-sm font-normal transition-all disabled:pointer-events-none data-[state=active]:text-foreground px-3',
  {
    variants: {
      variant: {
        default:
          'data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:shadow  disabled:opacity-50 rounded-md py-1',
        secondary:
          'data-[state=active]:bg-secondary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:shadow  disabled:opacity-50 rounded-md py-1',
        underline:
          'bg-none border-b-2 border-none focus:border-primary ring-0 outline-none shadow-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary disabled:opacity-100 data-[state=active]:shadow-none rounded-none m-0 pt-1.5 pb-2 hover:bg-background-muted',
      },
      size: {
        default: 'py-2',
        sm: ' text-xs',
        lg: 'py-3',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
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

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(({ className, variant, size, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn(TabsListVariants({ variant, size, className }))} {...props} />
));
TabsList.displayName = TabsPrimitive.List.displayName;

//

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof TabsTriggerVariants> {
  asChild?: boolean;
  value: string;
}

const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, variant, size, value, ...props }, ref) => (
    <TabsPrimitive.Trigger ref={ref} value={value} className={cn(TabsTriggerVariants({ variant, size, className }))} {...props} />
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
