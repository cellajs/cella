import { useEffect, useRef, useState } from 'react';

interface MeasureResult<T extends Element> {
  ref: React.RefObject<T | null>;
  bounds: DOMRectReadOnly;
}

/**
 * Hook to measure the size of an element.
 *
 * @returns ref to attach to the element and its bounds (width, height, etc.).
 */
export const useMeasure = <T extends Element = Element>(): MeasureResult<T> => {
  const ref = useRef<T>(null);
  const [bounds, setBounds] = useState<DOMRectReadOnly>(new DOMRectReadOnly());

  useEffect(() => {
    let observer: ResizeObserver;

    if (ref.current) {
      observer = new ResizeObserver(([entry]) => {
        if (entry) {
          setBounds(entry.contentRect);
        }
      });
      observer.observe(ref.current);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  return { ref, bounds };
};
