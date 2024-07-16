import type { SVGProps } from 'react';

export const HighIcon = ({ ...props }: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" fill="#5e5e5f" aria-label="High" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>High</title>
    <rect width="3" height="6" x="1.5" y="8" rx="1" />
    <rect width="3" height="9" x="6.5" y="5" rx="1" />
    <rect width="3" height="12" x="11.5" y="2" rx="1" />
  </svg>
);
