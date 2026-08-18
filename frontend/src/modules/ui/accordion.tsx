import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export function Accordion({ ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b last:border-b-0', className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props & React.RefAttributes<HTMLButtonElement>) {
  return (
    <AccordionPrimitive.Header className="group flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left font-medium text-sm decoration-foreground/20 underline-offset-3 outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset group-active:decoration-foreground/50 data-disabled:pointer-events-none data-disabled:opacity-50 sm:px-3 [&[data-panel-open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-5 shrink-0 translate-y-0.5 text-muted-foreground/80 transition-transform duration-200 group-hover:text-foreground" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="not-data-open:animate-accordion-up overflow-hidden text-sm data-open:animate-accordion-down"
      {...props}
    >
      <div className={cn('pt-0 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
