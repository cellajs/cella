import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const AcceptedIcon = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="High"
    aria-labelledby={titleId}
    aria-describedby={descId}
    {...props}
  >
    {desc ? <desc id={descId}>{desc}</desc> : null}
    <title id={titleId}>{title}</title>
    <g clip-path="url(#clip0_179_6330)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5.41769 0.666626C2.79368 0.666626 0.666504 2.79381 0.666504 5.41782V10.5821C0.666504 13.2061 2.79369 15.3333 5.4177 15.3333H10.582C13.206 15.3333 15.3332 13.2061 15.3332 10.5821V5.41781C15.3332 2.79381 13.206 0.666626 10.582 0.666626H5.41769ZM12.4714 5.58249C12.7318 5.32214 12.7318 4.90003 12.4714 4.63968C12.2111 4.37933 11.7889 4.37933 11.5286 4.63968L6.66667 9.50161L4.4714 7.30635C4.21106 7.046 3.78894 7.046 3.5286 7.30635C3.26825 7.5667 3.26825 7.98881 3.5286 8.24916L6.19526 10.9158L6.66667 11.3872L7.13807 10.9158L12.4714 5.58249Z"
        fill="#16A34A"
      />
    </g>
    <defs>
      <clipPath id="clip0_179_6330">
        <rect width="16" height="16" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
