import { type RefObject, useLayoutEffect, useState } from 'react';

/** The "+N" button's width: the `w-9` of `MoreChipsButton`. */
const moreWidth = 36;

/**
 * How many of the chips in `rowRef` fit on its one line, at least one, and how to hide the rest behind "+N". `chipKeys`
 * names the chips in order; with `isCollapsed` false every chip shows.
 */
export function useFittingChips(rowRef: RefObject<HTMLElement | null>, chipKeys: string[], isCollapsed = true) {
  const [fitting, setFitting] = useState(Number.POSITIVE_INFINITY);
  const keys = chipKeys.join();

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = [...row.querySelectorAll<HTMLElement>('[data-slot="chip"]')].map((chip) => chip.offsetWidth);
      let used = 0;
      let count = 0;
      for (const [index, width] of widths.entries()) {
        const moreRoom = index < widths.length - 1 ? gap + moreWidth : 0;
        if (used + width + moreRoom > row.clientWidth) break;
        used += width + gap;
        count += 1;
      }
      setFitting(Math.max(count, 1));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [keys]);

  return {
    moreCount: isCollapsed ? Math.max(chipKeys.length - fitting, 0) : 0,
    hiddenClass: (index: number) => isCollapsed && index >= fitting && 'invisible absolute',
  };
}
