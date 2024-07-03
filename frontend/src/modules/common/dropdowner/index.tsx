import { useCallback, useEffect, useState } from 'react';
import { type DropDownT, type DropDownToRemove, dropDownState } from '../dropdowner/state';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function DropDowner() {
  const [dropDown, setDropDown] = useState<DropDownT | null>(null);
  const [offset, setOffset] = useState(0);
  const removeDropDown = useCallback((dropDown: DropDownT | DropDownToRemove) => {
    if (dropDown.id === dropDown?.id) setDropDown(null);
  }, []);

  useEffect(() => {
    return dropDownState.subscribe((dropDown) => {
      if ((dropDown as DropDownToRemove).remove) removeDropDown(dropDown as DropDownT);
      else setDropDown(dropDown as DropDownT);
    });
  }, []);

  useEffect(() => {
    if (!dropDown) return;
    const dropdownElement = document.querySelector('[data-side]');
    if (!dropdownElement || !dropDown.trigger) return setOffset(0);
    if (window.innerHeight < dropdownElement.clientHeight + dropDown.position.top) return setOffset(dropDown.trigger.clientHeight * 1.8);
    return setOffset(-(dropDown.trigger.clientHeight / 2));
  }, [dropDown]);

  if (!dropDown) return null;

  const positionStyle = {
    top: dropDown.position.top,
    left: dropDown.position.left,
    position: 'fixed' as const,
    z: 1000,
  };

  return (
    <div style={positionStyle}>
      <DropdownMenu.Root open={!!dropDown}>
        <DropdownMenu.Trigger />
        <DropdownMenu.Content
          sideOffset={offset}
          side="bottom"
          align="end"
          onCloseAutoFocus={() => {
            if (dropDown.refocus && dropDown.trigger) dropDown.trigger.focus();
          }}
          onEscapeKeyDown={() => dropDownState.remove()}
          onInteractOutside={() => dropDownState.remove()}
        >
          {dropDown.content}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
}
