import * as React from 'react';

/**
 * Auto-resizes a `<textarea>` to fit its content on input, matching height to `scrollHeight`.
 * @param autoResize - Enables the resize behavior when true.
 * @returns `{ areaRef }` ref to attach to the textarea.
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
