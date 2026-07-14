import * as React from 'react';

// TODO does base ui have its own solution for this or we still need this? please remove todo if we still need it, just a research request
/**
 * Custom hook to automatically resize a textarea based on its content.
 *
 * This hook adjusts the height of a `<textarea>` element based on its content. It will resize the textarea as
 * the user types, making it expand or contract according to the `scrollHeight`. The hook exposes the textarea
 * reference to parent components via `useImperativeHandle`.
 *
 * @param autoResize - Boolean flag indicating whether the auto-resizing behavior should be applied.
 *
 * @returns An object containing the `areaRef` to be used in the parent component.
 */
export const useAutoResize = (autoResize: boolean) => {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const ref = areaRef?.current;

    const updateAreaHeight = () => {
      if (ref && autoResize) {
        // Reset height to recalculate scrollHeight
        ref.style.height = 'auto';
        // Set height to scrollHeight to adjust for content
        ref.style.height = `${ref ? ref.scrollHeight : 0}px`;
      }
    };

    updateAreaHeight();

    ref?.addEventListener('input', updateAreaHeight);
    return () => ref?.removeEventListener('input', updateAreaHeight);
  }, [autoResize]);

  return { areaRef };
};
