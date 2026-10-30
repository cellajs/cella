import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '~/utils/cn';

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-full items-center justify-center gap-0.5 rounded-md border border-input bg-muted p-0.5 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "focus-effect inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 font-medium text-muted-foreground text-sm transition-[color,box-shadow] hover:text-foreground data-disabled:pointer-events-none data-active:inset-ring data-active:inset-ring-input data-active:bg-background data-active:text-foreground data-disabled:opacity-50 dark:data-active:inset-ring-input-hover dark:data-active:bg-input [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-hidden', className)} {...props} />;
}
