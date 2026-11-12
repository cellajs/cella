import { FoldHorizontalIcon, UnfoldHorizontalIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { tw } from '~/utils/tw';

// How close the pointer comes to the window's corner before the tab shows its label
const reach = 140;

/** Room below a scrolling panel's last item: it scrolls clear of the tab. @public */
export const panelEndSpace = tw('pb-40');

/** Switches a board between its ideal widths and the fit, from the window's bottom-right corner (resizable-panels.md, E9). */
export function BoardFitToggle({ fit, onToggle }: { fit: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const near = usePointerNearCorner();
  const [focused, setFocused] = useState(false);

  return (
    <TooltipButton toolTipContent={t(fit ? 'c:more_room_hint' : 'c:fit_to_screen_hint')} side="top">
      <button
        type="button"
        data-open={near || focused || undefined}
        onClick={onToggle}
        onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        // Fixed to the window, not the board: the row scrolls, and the tab belongs to the window's edge
        className="group/fit focus-effect focus-inset border-panel-edge bg-secondary text-faint-foreground hover:bg-muted-hover hover:text-foreground data-open:text-foreground fixed right-0 bottom-0 z-30 flex h-8 items-center gap-0 rounded-tl-lg border-t border-l px-2 text-sm font-medium whitespace-nowrap transition-[padding,gap,background-color,color] duration-150 ease-out data-open:gap-1.5 data-open:pr-4 data-open:pl-3 motion-reduce:transition-none"
      >
        {fit ? <UnfoldHorizontalIcon className="size-3.75 shrink-0" /> : <FoldHorizontalIcon className="size-3.75 shrink-0" />}
        <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-150 ease-out group-data-open/fit:grid-cols-[1fr] motion-reduce:transition-none">
          <span className="overflow-hidden">{t(fit ? 'c:more_room' : 'c:fit_to_screen')}</span>
        </span>
      </button>
    </TooltipButton>
  );
}

// A coarse pointer keeps the label: it has no hover to come near with
function usePointerNearCorner() {
  const [near, setNear] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let frame = 0;
    let point: { x: number; y: number } | null = null;

    const check = () => {
      frame = 0;
      setNear(!!point && Math.hypot(window.innerWidth - point.x, window.innerHeight - point.y) < reach);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const handleMove = (event: PointerEvent) => {
      point = { x: event.clientX, y: event.clientY };
      schedule();
    };
    // No relatedTarget: the pointer left the window
    const handleOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      point = null;
      schedule();
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerout', handleOut);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerout', handleOut);
    };
  }, []);

  return near;
}
