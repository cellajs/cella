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
  focusableViewport = true,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  viewportClassName?: string;
  /** Sets min-width: fit-content on the content. */
  horizontalScroll?: boolean;
  /** Auto-scrolls while a drag nears an edge. */
  autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  disableTrackClick?: boolean;
  /** `false` takes the viewport out of the tab order: only for content with its own tab stops, which scroll it already. */
  focusableViewport?: boolean;
}) {
  const internalViewportRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = externalViewportRef ?? internalViewportRef;

  React.useEffect(() => {
    if (!autoScrollOnDrag || !viewportRef.current) return;
    const axis = typeof autoScrollOnDrag === 'string' ? autoScrollOnDrag : undefined;
    return autoScrollForElements({ element: viewportRef.current, ...(axis && { getAllowedAxis: () => axis }) });
  }, [autoScrollOnDrag, viewportRef]);

  // Base UI's content ResizeObserver cannot fire while the content div is height-pinned to 100%, so a subtree
  // mutation that changes the scrollable size re-dispatches a scroll event to trigger the primitive's recompute.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (typeof MutationObserver === 'undefined' || !viewport) return;
    let lastWidth = viewport.scrollWidth;
    let lastHeight = viewport.scrollHeight;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { scrollWidth, scrollHeight } = viewport;
        if (scrollWidth === lastWidth && scrollHeight === lastHeight) return;
        lastWidth = scrollWidth;
        lastHeight = scrollHeight;
        viewport.dispatchEvent(new Event('scroll'));
      });
    });
    observer.observe(viewport, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewportRef]);

  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        id={id ? `${id}-viewport` : undefined}
        ref={viewportRef}
        tabIndex={focusableViewport ? undefined : -1}
        className={cn('focus-effect focus-inset size-full touch-manipulation rounded-[inherit] outline-hidden', viewportClassName)}
      >
        <ScrollAreaPrimitive.Content style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: horizontalScroll ? undefined : 0 }}>
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
}: ScrollAreaPrimitive.Scrollbar.Props & { disableTrackClick?: boolean }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'z-20 flex p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent',
        disableTrackClick && 'pointer-events-none *:pointer-events-auto',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb data-slot="scroll-area-thumb" className="bg-border relative flex-1 rounded-full" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
