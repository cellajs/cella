import { useCallback, useEffect, useState } from 'react';
import { type DropDownT, type DropDownToRemove, dropDownState } from '../dropdowner/state';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

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
