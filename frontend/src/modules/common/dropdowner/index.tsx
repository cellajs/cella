import { useCallback, useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dropDownState, type DropDownT, type DropDownToRemove } from '../dropdowner/state';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';
import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';

export function DropDowner() {
  const [dropDowns, setDropDowns] = useState<DropDownT[]>([]);
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const removeDropDown = useCallback((dropDown: DropDownT | DropDownToRemove) => {
    setDropDowns((dropDowns) => dropDowns.filter(({ id }) => id !== dropDown.id));
    if (dropDown.refocus && prevFocusedElement.current) {
      // Timeout is needed to prevent focus from being stolen by the dropDown that was just removed
      setTimeout(() => {
        prevFocusedElement.current?.focus();
        prevFocusedElement.current = null;
      }, 1);
    }
  }, []);

  useEffect(() => {
    return dropDownState.subscribe((dropDown) => {
      if ((dropDown as DropDownToRemove).remove) {
        removeDropDown(dropDown as DropDownT);
        return;
      }
      prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
      setDropDowns((dropDowns) => {
        const existingDropDown = dropDowns.find(({ id }) => id === dropDown.id);
        if (existingDropDown) return dropDowns;
        return [...dropDowns, dropDown];
      });
    });
  }, []);

  if (!dropDowns.length) return null;

  return dropDowns.map((dropDown) => {
    if (!isMobile || !dropDown.drawerOnMobile) {
      return (
        <DropdownMenu key={dropDown.id} modal={!dropDown.container}>
          {dropDown.container && (
            <div className="fixed inset-0 z-30 bg-background/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          )}
          <DropdownMenuTrigger>{dropDown.trigger}</DropdownMenuTrigger>
          <DropdownMenuContent autoFocus={dropDown.autoFocus} className={dropDown.className}>
            {dropDown.content}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  });
}
