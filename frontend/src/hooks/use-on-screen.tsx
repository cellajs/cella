import { useCallback, useState } from 'react';

export const useOnScreen = (
  {
    root,
    rootMargin,
    threshold,
    firstChild,
  }: {
    root?: Element | null;
    rootMargin?: string;
    threshold?: number;
    firstChild?: boolean;
  } = {
      root: null,
      rootMargin: '0px',
      threshold: 0,
      firstChild: false,
    },
) => {
  const [observer, setObserver] = useState<IntersectionObserver>();
  const [isIntersecting, setIntersecting] = useState(false);

  const measureRef = useCallback(
    (node: Element | null) => {
      if (node) {
        let target = node;
        if (firstChild && node.firstChild) {
          target = node.firstChild as Element;
        }
        const observer = new IntersectionObserver(
          ([entry]) => {
            setIntersecting(entry.isIntersecting);
          },
          { root, rootMargin, threshold },
        );

        observer.observe(target);
        setObserver(observer);
      }
    },
    [root, rootMargin, threshold],
  );

  return { measureRef, isIntersecting, observer };
};
