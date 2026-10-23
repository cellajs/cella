import { useEffect, useRef } from 'react';

export const useAutoResize = (autoResize: boolean) => {
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
  }, [autoResize]);

  return { areaRef };
};
