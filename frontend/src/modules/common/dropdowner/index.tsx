import { useCallback, useEffect, useRef, useState } from 'react';
import { type DropDownT, type DropDownToRemove, dropDownState } from '../dropdowner/state';
import { createPortal } from 'react-dom';

interface RefContent {
  current: HTMLDivElement;
  height: number;
  width: number;
}

export function DropDowner() {
  const [dropDown, setDropDown] = useState<DropDownT | null>(null);
  const prevFocusedElement = useRef<HTMLElement | null>(null);
  const [contentNode, setContentNode] = useState<RefContent>({} as RefContent);

  const handleContentRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setContentNode({ current: node, height: node.offsetHeight, width: node.offsetWidth });
  }, []);

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

  const updatePosition = useCallback(() => {
    if (dropDown?.trigger) {
      const triggerRect = dropDown.trigger?.getBoundingClientRect();
      setDropDown((prevDrDown) => {
        if (!prevDrDown) return null;
        return {
          ...prevDrDown,
          position: {
            ...prevDrDown.position,
            ...{ top: triggerRect.bottom },
          },
        };
      });
    }
  }, [dropDown]);

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
      if (dropDown && contentNode.current && !contentNode.current.contains(event.target as Node)) {
        if (dropDown?.trigger?.contains(event.target as Node)) return;
        dropDownState.remove();
      }
    };
    if (dropDown) {
      document.body.style.overflow = 'hidden'; // hide body scroll on open
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePosition, true); // true to capture event in the capture phase
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
    document.body.style.overflow = 'auto';
  }, [dropDown]);

  if (!dropDown) return null;
  const positionStyle = {
    top:
      window.innerHeight < dropDown.position.top + contentNode.height
        ? dropDown.position.top - (contentNode.height + (dropDown.trigger?.clientHeight || 0))
        : dropDown.position.top,
    left: Math.max(0, dropDown.position.left - contentNode.width),
    position: 'absolute' as const,
  };

  return createPortal(
    <div className="z-[1000]" style={positionStyle} ref={handleContentRef}>
      {dropDown.content}
    </div>,
    document.body,
  );
}
