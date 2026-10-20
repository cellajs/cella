import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Tooltip, TooltipContent } from '~/modules/ui/tooltip';

/** The tip over a dropdown's trigger saying the action picked from it worked, e.g. "Copied", also announced. */
export function DropdownerDoneTip() {
  const done = useDropdowner((state) => state.done);

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {done?.open ? done.label : ''}
      </span>
      {done && (
        <Tooltip key={done.key} open={done.open}>
          {/* Shown on mobile too: unlike a hover hint, it reports what just happened */}
          <TooltipContent anchor={done.trigger} side="top" sideOffset={6} className="pointer-events-none max-sm:block">
            {done.label}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
