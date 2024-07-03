import { useCallback, useEffect, useState } from 'react';
import { type DropDownT, type DropDownToRemove, dropDownState } from '../dropdowner/state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import ReactDOM from 'react-dom';

export function DropDowner() {
  const [dropDown, setDropDown] = useState<DropDownT | null>(null);
  const removeDropDown = useCallback((dropDown: DropDownT | DropDownToRemove) => {
    if (dropDown.id === dropDown?.id) setDropDown(null);
  }, []);

  useEffect(() => {
    return dropDownState.subscribe((dropDown) => {
      if ((dropDown as DropDownToRemove).remove) removeDropDown(dropDown as DropDownT);
      else setDropDown(dropDown as DropDownT);
    });
  }, []);

  if (!dropDown?.trigger) return null;
  
  const dropdownContainer = document.createElement('div');
  dropDown.trigger.appendChild(dropdownContainer);

  return ReactDOM.createPortal(
    <DropdownMenu key={dropDown.id} open={true}>
      <DropdownMenuTrigger />
      <DropdownMenuContent
        sideOffset={4}
        side="bottom"
        align="end"
        onCloseAutoFocus={() => {
          if (dropDown.refocus && dropDown.trigger) dropDown.trigger.focus();
        }}
        onEscapeKeyDown={() => dropDownState.remove()}
        onInteractOutside={() => dropDownState.remove()}
      >
        {dropDown.content}
      </DropdownMenuContent>
    </DropdownMenu>, dropdownContainer
  );
}
