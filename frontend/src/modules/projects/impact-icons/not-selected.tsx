import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const NotSelected = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
  <svg width="1em" height="1em" fill="#888" aria-label="No selection" aria-labelledby={titleId} aria-describedby={descId} {...props}>
    {desc ? <desc id={descId}>{desc}</desc> : null}
    <title id={titleId}>{title}</title>
		<rect width={3} height={1.5} x={1.5} y={7.25} opacity={0.4} rx={0.5} />
		<rect width={3} height={1.5} x={6.5} y={7.25} opacity={0.4} rx={0.5} />
		<rect width={3} height={1.5} x={11.5} y={7.25} opacity={0.4} rx={0.5} />
  </svg>
);
