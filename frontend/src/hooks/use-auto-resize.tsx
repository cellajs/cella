import * as React from 'react';

/**
 * Custom hook to automatically resize a textarea based on its content.
 *
 * This hook adjusts the height of a `<textarea>` element based on its content. It will resize the textarea as
 * the user types, making it expand or contract according to the `scrollHeight`. The hook exposes the textarea
 * reference to parent components via `useImperativeHandle`.
 *
 * @param ref - Forwarded reference to the textarea element.
 * @param autoResize - Boolean flag indicating whether the auto-resizing behavior should be applied.
 *
 * @returns An object containing the `areaRef` to be used in the parent component.
 */
export const useAutoResize = (ref: React.ForwardedRef<HTMLTextAreaElement>, autoResize: boolean) => {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/style/noNonNullAssertion: Expose the textarea reference to parent components
  React.useImperativeHandle(ref, () => areaRef.current!);

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
  }, []);

  return { areaRef };
};
