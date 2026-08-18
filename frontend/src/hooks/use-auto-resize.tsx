import * as React from 'react';

export const useAutoResize = (autoResize: boolean) => {
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const ref = areaRef?.current;

    const updateAreaHeight = () => {
      if (ref && autoResize) {
        ref.style.height = 'auto';
        ref.style.height = `${ref ? ref.scrollHeight : 0}px`;
      }
    };

    updateAreaHeight();

    ref?.addEventListener('input', updateAreaHeight);
    return () => ref?.removeEventListener('input', updateAreaHeight);
  }, [autoResize]);

  return { areaRef };
};
