import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { type DropdownT, dropdownerState } from '~/modules/common/dropdowner/state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

export function Dropdowner() {
  const [dropdown, setDropdown] = useState<DropdownT | null>(null);

  const dropdownContainerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return dropdownerState.subscribe((dropdowner) => {
      if ('remove' in dropdowner) {
        setDropdown(null);
        dropdownContainerRef.current = null;
      } else {
        setDropdown(dropdowner);

        if (!dropdownContainerRef.current) dropdownContainerRef.current = document.createElement('div');
        // Dynamically update alignment classes
        dropdownContainerRef.current.className = `absolute bottom-0 ${dropdowner.align === 'start' ? 'left-0' : 'right-0'}`;
      }
    });
  }, []);

  if (!dropdown?.trigger || !dropdownContainerRef.current) return null;

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
