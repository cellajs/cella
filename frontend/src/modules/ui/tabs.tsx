import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils/cn';

const tabsListVariants = cva('inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg p-[3px] text-muted-foreground', {
  variants: {
    variant: { default: '', side: 'flex h-fit w-fit flex-col [&>button]:w-full', underline: 'rounded-none border-b pb-2' },
  },
  defaultVariants: { variant: 'default' },
});

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function TabsList({ className, variant, ...props }: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(tabsListVariants({ variant, className }))} {...props} />;
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "focus-effect inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-muted-foreground text-sm transition-[color,box-shadow] hover:text-foreground data-disabled:pointer-events-none data-active:bg-secondary data-active:text-foreground data-disabled:opacity-50 data-active:shadow-sm dark:data-active:border-input dark:data-active:bg-input/30 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-hidden', className)} {...props} />;
}
