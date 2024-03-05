import { useCallback, useState } from 'react';

interface UseOnScreenProps {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number;
  firstChild?: boolean;
}

// This hook is used to detect if an element is in the viewport
export const useOnScreen = ({ root = null, rootMargin = '0px', threshold = 0, firstChild = false }: UseOnScreenProps) => {
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
