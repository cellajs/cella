import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { type DropDownT, type DropDownToRemove, dropdownerState } from '~/modules/common/dropdowner/state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

//TODO:generics issue 
export function DropDowner() {
  const [dropdowner, setDropdowner] = useState<DropDownT | null>(null);

  useEffect(() => {
    return dropdownerState.subscribe((dropdowner) => {
      if ((dropdowner as DropDownToRemove).remove) setDropdowner(null);
      else setDropdowner(dropdowner as DropDownT);
    });
  }, []);

  if (!dropdowner?.trigger) return null;

  const dropdownContainer = document.createElement('div');
  dropdownContainer.classList.add('absolute', 'bottom-0', dropdowner.align === 'start' ? 'left-0' : 'right-0');
  dropdowner.trigger.appendChild(dropdownContainer);

  return ReactDOM.createPortal(
    <DropdownMenu key={dropdowner.id} open={true}>
      <DropdownMenuTrigger />
      <DropdownMenuContent
        className="p-0"
        sideOffset={12}
        side="bottom"
        align={dropdowner.align || 'start'}
        onCloseAutoFocus={() => {
          if (dropdowner.refocus && dropdowner.trigger) dropdowner.trigger.focus();
        }}
        onEscapeKeyDown={() => dropdownerState.remove()}
        onInteractOutside={() => dropdownerState.remove()}
      >
        {dropdowner.content}
      </DropdownMenuContent>
    </DropdownMenu>,
    dropdownContainer,
  );
}
