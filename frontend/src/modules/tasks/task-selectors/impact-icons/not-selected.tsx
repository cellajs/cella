import type { SVGProps } from 'react';

export const NotSelected = ({ ...props }: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" fill="#888" aria-label="Not selected" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>Not selected</title>
    <rect width="3" height="1.5" x="1.5" y="7.25" opacity="0.4" rx="0.5" />
    <rect width="3" height="1.5" x="6.5" y="7.25" opacity="0.4" rx="0.5" />
    <rect width="3" height="1.5" x="11.5" y="7.25" opacity="0.4" rx="0.5" />
  </svg>
);
