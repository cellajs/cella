import type { SVGProps } from 'react';

export const NoneIcon = ({ ...props }: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" fill="#5e5e5f" aria-label="None" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>None</title>
    <rect width="3" height="6" x="1.5" y="8" fillOpacity="0.4" rx="1" />
    <rect width="3" height="9" x="6.5" y="5" fillOpacity="0.4" rx="1" />
    <rect width="3" height="12" x="11.5" y="2" fillOpacity="0.4" rx="1" />
  </svg>
);
