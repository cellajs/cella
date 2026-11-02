import { type RefObject, useLayoutEffect, useState } from 'react';

/** The "+N" button's width: its `w-9`. */
const moreWidth = 36;

/** How many of the chips in `rowRef` fit on its one line, at least one. `chipKeys` is what changes with the chips. */
export function useFittingChips(rowRef: RefObject<HTMLElement | null>, chipKeys: string) {
  const [fitting, setFitting] = useState(Number.POSITIVE_INFINITY);

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
  }, [chipKeys]);

  return fitting;
}
