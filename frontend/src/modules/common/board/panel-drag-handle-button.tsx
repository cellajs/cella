import { ChevronsLeftRightIcon, ChevronsRightLeftIcon, GripVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePanelCollapse, usePanelDragHandle } from '~/modules/common/board/board-drag';
import { useBoardStore } from '~/modules/common/board/board-store';
import { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';
import { hintFadeOut } from '~/modules/common/resizable-panels/resizable-panels';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface PanelDragHandleButtonProps {
  /** Announced by screen readers */
  name: string;
  /** aria-label when the board is not reorderable */
  fallbackLabel?: string;
  className?: string;
  icon?: ReactNode;
  /** Shown under the pointer while dragging */
  preview?: ReactNode;
  children?: ReactNode;
}

/**
 * A panel header button that is also the panel's reorder handle, from the board's drag context (null when the board is
 * not reorderable): a click collapses the panel, ←/→ move it, and its move menu leads with the collapse. On hover the
 * `icon` cross-fades to a drag grip. Without reordering it only collapses.
 */
export function PanelDragHandleButton({ name, fallbackLabel, className, icon, preview, children }: PanelDragHandleButtonProps) {
  const { t } = useTranslation();
  const panelDrag = usePanelDragHandle();
  const panelCollapse = usePanelCollapse();
  const isCollapsed = useBoardStore((state) => !!panelCollapse && !!state.panelCollapseState[panelCollapse.panelId]);

  const content = (
    <>
      {(icon || panelDrag) && (
        <span className="relative inline-flex shrink-0 items-center justify-center">
          <span
            className={cn(
              'inline-flex',
              panelDrag &&
                'transition-[opacity,filter] group-hover/drag:opacity-30 group-hover/drag:blur-[1px] group-focus/drag:opacity-30 group-focus/drag:blur-[1px]',
            )}
          >
            {icon}
          </span>
          {panelDrag && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/drag:opacity-100 group-focus/drag:opacity-100">
              <GripVerticalIcon className="size-4 shrink-0" />
            </span>
          )}
        </span>
      )}
      {children && <span className={cn('min-w-0 truncate', hintFadeOut)}>{children}</span>}
    </>
  );

  if (!panelDrag) {
    return (
      <Button
        variant="ghost"
        // aria-expanded names the panel's state here; ghost's open-menu fill would mark every open panel
        className={cn('aria-expanded:bg-transparent', className)}
        aria-label={fallbackLabel}
        aria-expanded={panelCollapse ? !isCollapsed : undefined}
        onClick={panelCollapse?.onToggleCollapsed}
      >
        {content}
      </Button>
    );
  }

  const { registerHandle } = panelDrag;
  const CollapseIcon = isCollapsed ? ChevronsLeftRightIcon : ChevronsRightLeftIcon;

  return (
    <>
      <ReorderHandle
        ref={registerHandle}
        id={panelDrag.panelId}
        name={name}
        index={panelDrag.index}
        total={panelDrag.total}
        orientation="horizontal"
        onMove={panelDrag.onMove}
        onClick={panelDrag.onToggleCollapsed}
        menuItems={
          <DropdownMenuItem onClick={panelDrag.onToggleCollapsed}>
            <CollapseIcon />
            {t(isCollapsed ? 'c:expand' : 'c:collapse')}
          </DropdownMenuItem>
        }
        // Any focus shows the ring, a click's too: the handle then takes ←/→. The same ring as focus-effect's, so a key
        // focus draws it once.
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          className,
          'group/drag focus-ring:focus:ring-2 focus:ring-ring focus:ring-offset-background cursor-grab focus:ring-offset-2 active:cursor-grabbing',
        )}
      >
        {content}
      </ReorderHandle>
      {/* Windows fades a drag preview wider than 280px */}
      {panelDrag.previewContainer && createPortal(<div className="max-w-64">{preview ?? <Chip>{name}</Chip>}</div>, panelDrag.previewContainer)}
    </>
  );
}
