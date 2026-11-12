import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { DropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { DropdownerDropdown } from '~/modules/common/dropdowner/dropdown';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useOverlayLock } from '~/modules/common/overlay-store-helpers';
import { Tooltip, TooltipContent } from '~/modules/ui/tooltip';

/** The tip over a dropdown's trigger saying the action picked from it worked, e.g. "Copied", also announced. A phone gets no tip, as with any tooltip: Android reports a copy itself, and the trigger's check stays. */
function DropdownerDoneTip() {
  const done = useDropdowner((state) => state.done);

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {done?.open ? done.label : ''}
      </span>
      {done && (
        <Tooltip key={done.key} open={done.open}>
          <TooltipContent anchor={done.trigger} sideOffset={6} className="pointer-events-none">
            {done.label}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

/** Renders the open dropdown: a drawer on mobile, a menu or panel popup on desktop. */
export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const isMobile = useBreakpointBelow('sm');

  useOverlayLock('dropdowner', !!dropdown);

  return (
    <>
      {dropdown && (isMobile ? <DropdownerDrawer dropdown={dropdown} /> : <DropdownerDropdown dropdown={dropdown} />)}
      <DropdownerDoneTip />
    </>
  );
}
