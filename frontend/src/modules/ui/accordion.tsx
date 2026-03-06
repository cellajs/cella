import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '~/utils/cn';

// Compatibility layer: map Radix-style `type`/`collapsible` props to Base UI's `multiple` prop
interface AccordionProps extends Omit<AccordionPrimitive.Root.Props, 'multiple'> {
  type?: 'single' | 'multiple';
  collapsible?: boolean;
  multiple?: boolean;
}

export function Accordion({ type, collapsible: _collapsible, multiple, ...props }: AccordionProps) {
  const isMultiple = multiple ?? type === 'multiple';
  return <AccordionPrimitive.Root data-slot="accordion" multiple={isMultiple} {...props} />;
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
    <AccordionPrimitive.Header className="flex group">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'focus-visible:border-ring focus-visible:ring-ring flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&[data-panel-open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground/80 group-hover:text-foreground pointer-events-none size-5 shrink-0 translate-y-0.5 transition-transform duration-200" />
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
      className="not-[[data-open]]:animate-accordion-up data-[open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn('pt-0 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
