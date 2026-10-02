import { createCn } from 'cnfast';

/**
 * Merges Tailwind classes, resolving conflicts. Built with cnfast, a faster drop-in for the `twMerge(clsx(...))`
 * pattern with byte-identical output. The app's own utilities join the group of the property they set, so
 * `cn('text-muted-foreground', 'soft-text')` keeps `soft-text` only, and `intent-*` forms a group of its own. The
 * default groups already read the theme's `text-2xs` and `text-md` as font sizes.
 * @see https://github.com/aidenybai/cnfast
 */
export const cn = createCn({
  extend: {
    classGroups: {
      'text-color': ['soft-text', 'soft-text-strong', 'soft-text-stronger'],
      'bg-color': ['soft-bg', 'soft-bg-hover', 'soft-bg-strong', 'soft-bg-stronger'],
      'bg-image': ['soft-gradient'],
      'border-color': ['soft-border', 'soft-border-medium', 'soft-border-strong'],
      intent: [{ intent: ['primary', 'brand', 'destructive', 'success', 'secondary', 'warning'] }],
    },
  },
});
