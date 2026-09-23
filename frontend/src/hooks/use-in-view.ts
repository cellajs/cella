import { useCallback, useState } from 'react';

type UseInViewOptions = {
  /** Stop observing after the first intersection, so `inView` stays true. */
  once?: boolean;
  /** Visible fraction that counts as in view, passed to IntersectionObserver as `threshold`. */
  threshold?: number;
};

/**
 * Tracks whether an element intersects the viewport. Returns a callback ref, so it follows an element that mounts
 * late or remounts; a detached element reads as out of view unless `once` already latched it.
 */
export function useInView({ once = false, threshold = 0 }: UseInViewOptions = {}) {
  const [inView, setInView] = useState(false);

  const ref = useCallback(
    (node: Element | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) setInView(false);
        },
        { threshold },
      );
      observer.observe(node);
      return () => {
        observer.disconnect();
        if (!once) setInView(false);
      };
    },
    [once, threshold],
  );

  return { ref, inView };
}
