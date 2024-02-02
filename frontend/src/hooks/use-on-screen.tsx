import { useCallback, useState } from 'react';

export const useOnScreen = (
  {
    root,
    rootMargin,
    threshold,
  }: {
    root?: Element | null;
    rootMargin?: string;
    threshold?: number;
  } = {
    root: null,
    rootMargin: '0px',
    threshold: 0,
  },
) => {
  const [observer, setOserver] = useState<IntersectionObserver>();
  const [isIntersecting, setIntersecting] = useState(false);

  const measureRef = useCallback(
    (node: Element | null) => {
      if (node) {
        const observer = new IntersectionObserver(
          ([entry]) => {
            setIntersecting(entry.isIntersecting);
          },
          { root, rootMargin, threshold },
        );

        observer.observe(node);
        setOserver(observer);
      }
    },
    [root, rootMargin, threshold],
  );

  return { measureRef, isIntersecting, observer };
};
