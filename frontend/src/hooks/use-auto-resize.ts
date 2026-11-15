import { useEffect, useRef } from 'react';

/** Grows a textarea with its content; `value` re-measures after a change made from code, such as a form reset. */
export const useAutoResize = (autoResize: boolean, value: unknown) => {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = areaRef.current;
    if (!textarea || !autoResize) return;

    const updateAreaHeight = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    updateAreaHeight();
    textarea.addEventListener('input', updateAreaHeight);
    return () => textarea.removeEventListener('input', updateAreaHeight);
  }, [autoResize, value]);

  return { areaRef };
};
