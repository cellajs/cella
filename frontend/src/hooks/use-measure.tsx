import { useEffect, useRef, useState } from 'react';

/**
 * Hook to measure the size of an element.
 *
 * @returns ref to attach to the element and its bounds (width, height, etc.).
 */
export const useMeasure = <T extends Element = Element>() => {
  const ref = useRef<T>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;

      // border-box width (content + padding + border)
      const box = entry.borderBoxSize?.[0];
      if (box) {
        setBounds({
          width: box.inlineSize,
          height: box.blockSize,
        });
      } else {
        // fallback for older browsers
        const rect = entry.target.getBoundingClientRect();
        setBounds({ width: rect.width, height: rect.height });
      }
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return { ref, bounds };
};
