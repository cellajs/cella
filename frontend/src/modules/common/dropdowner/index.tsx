import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { type DropDownT, dropdownerState } from '~/modules/common/dropdowner/state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

export function DropDowner() {
  const [dropdown, setDropdown] = useState<DropDownT | null>(null);

  const dropdownContainerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return dropdownerState.subscribe((dropdowner) => {
      if ('remove' in dropdowner) setDropdown(null);
      else setDropdown(dropdowner);
    });
  }, []);

  if (!dropdown?.trigger) return null;

  // Only create the container once, using the ref to keep it persistent
  if (!dropdownContainerRef.current) {
    dropdownContainerRef.current = document.createElement('div');
    dropdownContainerRef.current.classList.add('absolute', 'bottom-0', dropdown.align === 'start' ? 'left-0' : 'right-0');
  }

  dropdown.trigger.appendChild(dropdownContainerRef.current);
  return ReactDOM.createPortal(
    <DropdownMenu key={dropdown.id} open={true} modal={dropdown.modal}>
      <DropdownMenuTrigger />
      <DropdownMenuContent
        className="p-0 data-[side=bottom]:translate-y-2 data-[side=top]:-translate-y-7"
        side="bottom"
        modal={dropdown.modal}
        align={dropdown.align || 'start'}
        onCloseAutoFocus={() => {
          if (dropdown.refocus && dropdown.trigger) dropdown.trigger.focus();
        }}
        onEscapeKeyDown={() => dropdownerState.remove()}
        onInteractOutside={(e) => {
          const isInside = dropdown.trigger?.contains(e.target as Node);
          if (!isInside) dropdownerState.remove();
        }}
      >
        {dropdown.content}
      </DropdownMenuContent>
    </DropdownMenu>,
    dropdownContainerRef.current,
  );
}
