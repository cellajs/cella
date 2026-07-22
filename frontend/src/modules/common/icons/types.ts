import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

/** Icon-component props omit Lucide pixel size because global CSS owns sizing. */
export type IconComponent = ComponentType<Omit<LucideProps, 'size'>>;
