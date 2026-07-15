import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Type for icon-as-prop components (lucide icons and the custom icons in this
 * directory). Deliberately omits lucide's `size` prop: the global
 * `:where(svg.lucide)` rule overrides its px attributes, so it silently does
 * nothing — size icons with classes (`icon-xs`…`icon-xl`, `size-*`) instead.
 */
export type IconComponent = ComponentType<Omit<LucideProps, 'size'>>;
