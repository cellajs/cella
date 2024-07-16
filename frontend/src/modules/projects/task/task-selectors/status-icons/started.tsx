import type { SVGProps } from 'react';

export const StartedIcon = ({ ...props }: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-label="Started" {...props}>
    <title>Started</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6.6 3.9a2.7 2.7 0 0 0-2.7 2.7v2.9C3.9 10.9 5 12 6.6 12h2.9c1.4 0 2.6-1.2 2.6-2.6v-3C12.1 5.2 11 4 9.5 4h-3Zm.3 1.5c-.8 0-1.5.7-1.5 1.5V9c0 .8.7 1.5 1.5 1.5H9c.8 0 1.5-.7 1.5-1.5V7c0-.8-.7-1.5-1.5-1.5H7Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.4.7A4.8 4.8 0 0 0 .7 5.4v5.2c0 2.6 2 4.7 4.7 4.7h5.2c2.6 0 4.7-2 4.7-4.7V5.4c0-2.6-2-4.7-4.7-4.7H5.4Zm.4 1.6c-2 0-3.5 1.5-3.5 3.5v4.4c0 2 1.5 3.5 3.5 3.5h4.4c2 0 3.5-1.5 3.5-3.5V5.8c0-2-1.5-3.5-3.5-3.5H5.8Z"
    />
  </svg>
);
