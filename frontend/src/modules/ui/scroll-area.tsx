import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function ScrollArea({
  className,
  children,
  id,
  viewportRef: externalViewportRef,
  viewportClassName,
  horizontalScroll,
  autoScrollOnDrag,
  disableTrackClick,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  viewportClassName?: string;
  /** Enable horizontal scrolling (min-width: fit-content on content). Defaults to false. */
  horizontalScroll?: boolean;
  /** Enable auto-scrolling when dragging elements near edges (uses @atlaskit/pragmatic-drag-and-drop). */
  autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  /** Disable clicking the scrollbar track to jump scroll position. Only the thumb remains draggable. */
  disableTrackClick?: boolean;
}) {
  const internalViewportRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = externalViewportRef ?? internalViewportRef;

  React.useEffect(() => {
    if (!autoScrollOnDrag || !viewportRef.current) return;
    const axis = typeof autoScrollOnDrag === 'string' ? autoScrollOnDrag : undefined;
    return autoScrollForElements({
      element: viewportRef.current,
      ...(axis && { getAllowedAxis: () => axis }),
    });
  }, [autoScrollOnDrag, viewportRef]);

  // TODO [#13]: revisit once Base UI observes content subtree (https://github.com/mui/base-ui).
  // Base UI's ScrollArea only ResizeObserves the viewport, so scrollbar visibility doesn't
  // recompute when inner content grows/shrinks (e.g. sheeter content swap, accordion toggles).
  // Subtree mutations require a 1px viewport min-height toggle to wake ResizeObserver.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (typeof MutationObserver === 'undefined' || !viewport) return;
    let toggle = false;
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        toggle = !toggle;
        viewport.style.minHeight = toggle ? 'calc(100% + 1px)' : '100%';
      });
    });
    mo.observe(viewport, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, [viewportRef]);

  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        id={id ? `${id}-viewport` : undefined}
        ref={viewportRef}
        className={cn('h-full w-full touch-manipulation rounded-[inherit] focus:outline-none', viewportClassName)}
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
      <ScrollBar disableTrackClick={disableTrackClick} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = 'vertical',
  disableTrackClick,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar> & { disableTrackClick?: boolean }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'z-20 flex select-none p-px transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        disableTrackClick && 'pointer-events-none',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className={cn('relative flex-1 rounded-full bg-border', disableTrackClick && 'pointer-events-auto')}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
