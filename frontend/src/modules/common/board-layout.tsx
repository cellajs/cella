import { Fragment, type ReactNode, useCallback, useImperativeHandle, useRef } from 'react';
import { useBoardUIStore } from '~/modules/common/board-ui';
import {
  type PanelGroupApi,
  ResizablePanel,
  ResizablePanelGroup,
  ResizableSeparator,
} from '~/modules/common/resizable-panels';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

export const PANEL_MIN_WIDTH = 300;
export const COLLAPSED_PANEL_MIN_WIDTH = 50;

export interface BoardLayoutColumn {
  panelId: string;
}

export interface BoardLayoutHandle {
  /** Expand a collapsed panel and scroll it into view. */
  expandAndScrollToPanel: (panelId: string) => void;
}

interface BoardLayoutProps {
  boardId: string;
  columns: BoardLayoutColumn[];
  defaultLayout: Record<string, number>;
  onLayoutChanged?: (layout: Record<string, number>) => void;
  children: (panelId: string, index: number) => ReactNode;
  /** When true, columns grow with content instead of being viewport-height constrained */
  autoHeight?: boolean;
  className?: string;
  groupClassName?: string;
  separatorClassName?: string;
  ref?: React.Ref<BoardLayoutHandle>;
}

/**
 * Generic board layout with resizable, collapsible panels.
 *
 * Uses pixel-based panel widths. Wrapped in a ScrollArea for horizontal
 * scrolling with auto-scroll support during drag-and-drop operations.
 */
export function BoardLayout({
  boardId,
  columns,
  defaultLayout,
  onLayoutChanged,
  children,
  autoHeight,
  className,
  groupClassName,
  separatorClassName,
  ref,
}: BoardLayoutProps) {
  const setCollapseState = useBoardUIStore((state) => state.togglePanelCollapsedState);
  const panelGroupApiRef = useRef<PanelGroupApi | null>(null);

  const handleReady = useCallback((api: PanelGroupApi) => {
    panelGroupApiRef.current = api;
  }, []);

  useImperativeHandle(ref, () => ({
    expandAndScrollToPanel(panelId: string) {
      panelGroupApiRef.current?.expandPanel(panelId);

      // Wait one frame for layout to settle after expand, then scroll
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-panel="${CSS.escape(panelId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
      });
    },
  }));

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      onLayoutChanged?.(layout);
    },
    [onLayoutChanged],
  );

  const handleCollapseChange = useCallback(
    (panelId: string, collapsed: boolean) => {
      setCollapseState(panelId, collapsed);
    },
    [setCollapseState],
  );

  return (
    <ScrollArea
      className={cn('transition', !autoHeight && 'sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)]', className)}
      viewportClassName="overflow-y-hidden!"
      horizontalScroll
      autoScrollOnDrag="horizontal"
    >
      <ResizablePanelGroup
        id={`panels-${boardId}`}
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
        onCollapseChange={handleCollapseChange}
        onReady={handleReady}
        className={cn('group/board', !autoHeight && 'h-[inherit]', groupClassName)}
      >
        {columns.map(({ panelId }, i) => (
          <Fragment key={panelId}>
            <ResizablePanel
              id={panelId}
              minWidth={PANEL_MIN_WIDTH}
              collapsedWidth={COLLAPSED_PANEL_MIN_WIDTH}
              collapsible
            >
              {children(panelId, i)}
            </ResizablePanel>

            {i < columns.length - 1 && (
              <ResizableSeparator
                index={i}
                className={cn(
                  'w-1.5 mx-[0.02rem] rounded border border-background bg-transparent hover:bg-primary/50 data-[separator=drag]:bg-primary transition-all',
                  separatorClassName,
                )}
              />
            )}
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </ScrollArea>
  );
}

interface BoardPanelContentProps {
  isCollapsed: boolean;
  collapsedContent: ReactNode;
  children: ReactNode;
}

/** Board panel content wrapper that switches between collapsed and expanded views */
export function BoardPanelContent({ isCollapsed, collapsedContent, children }: BoardPanelContentProps) {
  return <>{isCollapsed ? collapsedContent : children}</>;
}
