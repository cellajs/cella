import * as React from 'react';

export const useAutoResize = (autoResize: boolean) => {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const textarea = areaRef?.current;

    const updateAreaHeight = () => {
      if (textarea && autoResize) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea ? textarea.scrollHeight : 0}px`;
      }
    };

    updateAreaHeight();

    textarea?.addEventListener('input', updateAreaHeight);
    return () => textarea?.removeEventListener('input', updateAreaHeight);
  }, [autoResize]);

  return { areaRef };
};
