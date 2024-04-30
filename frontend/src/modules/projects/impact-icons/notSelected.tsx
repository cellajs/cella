import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const NotSelected = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
  <svg width="1em" height="1em" fill="#888" aria-label="Medium" aria-labelledby={titleId} aria-describedby={descId} {...props}>
    {desc ? <desc id={descId}>{desc}</desc> : null}
    <title id={titleId}>{title}</title>
    <rect width={3} height={6} x={1.5} y={8} fillOpacity={0.6} rx={1} />
    <rect width={3} height={9} x={6.5} y={5} fillOpacity={0.6} rx={1} />
    <rect width={3} height={12} x={11.5} y={2} fillOpacity={0.6} rx={1} />
  </svg>
);
