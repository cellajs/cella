import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function ScrollArea({
  className,
  children,
  id,
  viewportRef,
  viewportClassName,
  horizontalScroll,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  viewportClassName?: string;
  /** Enable horizontal scrolling (min-width: fit-content on content). Defaults to false. */
  horizontalScroll?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        id={id ? `${id}-viewport` : undefined}
        ref={viewportRef}
        className={cn('h-full w-full rounded-[inherit] touch-manipulation focus:outline-none', viewportClassName)}
      >
        <ScrollAreaPrimitive.Content
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minWidth: horizontalScroll ? undefined : 0,
          }}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'z-20 flex p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb data-slot="scroll-area-thumb" className="bg-border relative flex-1 rounded-full" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
