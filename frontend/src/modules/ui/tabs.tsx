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
        'border-input bg-muted text-muted-foreground inline-flex h-9 w-full items-center justify-center gap-0.5 rounded-md border p-0.5',
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
        "focus-effect text-muted-foreground hover:text-foreground data-active:inset-ring-input data-active:bg-background data-active:text-foreground dark:data-active:inset-ring-input-hover dark:data-active:bg-input inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] data-active:inset-ring data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-hidden', className)} {...props} />;
}
