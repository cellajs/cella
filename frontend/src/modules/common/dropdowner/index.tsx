import { useCallback, useEffect, useRef, useState } from 'react';
import { type DropDownT, type DropDownToRemove, dropDownState } from '../dropdowner/state';

export function DropDowner() {
  const [dropDown, setDropDown] = useState<DropDownT | null>(null);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const removeDropDown = useCallback((dropDown: DropDownT | DropDownToRemove) => {
    if (dropDown.id === dropDown?.id) {
      setDropDown(null);
      if (dropDown.refocus && prevFocusedElement.current) {
        setTimeout(() => {
          prevFocusedElement.current?.focus();
          prevFocusedElement.current = null;
        }, 1);
      }
    }
  }, []);

  useEffect(() => {
    return dropDownState.subscribe((dropDown) => {
      if ((dropDown as DropDownToRemove).remove) {
        removeDropDown(dropDown as DropDownT);
      } else {
        prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;
        setDropDown(dropDown as DropDownT);
      }
    });
  }, []);

  useEffect(() => {
    // close on outside click, except for trigger(it handles in state)
    const handleClickOutside = (event: MouseEvent) => {
      if (dropDown && contentRef.current && !contentRef.current.contains(event.target as Node)) {
        if (dropDown?.trigger?.contains(event.target as Node)) return;
        dropDownState.remove();
      }
    };

    if (dropDown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropDown]);

  if (!dropDown) return null;

  const positionStyle = {
    top: dropDown.position.top,
    left: dropDown.position.left,
  };

  return (
    // Change fixe position
    <div className="absolute z-[1000]" style={positionStyle}>
      <div ref={contentRef}>{dropDown.content}</div>
    </div>
  );
}
