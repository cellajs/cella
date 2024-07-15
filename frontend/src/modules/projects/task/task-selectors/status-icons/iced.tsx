import type { SVGProps } from 'react';

export const IcedIcon = ({ ...props }: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-label="Iced" {...props}>
    <title>Iced</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#1398E9"
      d="M5.4.7A4.8 4.8 0 0 0 .7 5.4v5.2c0 2.6 2.1 4.7 4.7 4.7h5.2c2.6 0 4.7-2 4.7-4.7V5.4c0-2.6-2-4.7-4.7-4.7H5.4Zm.4 1.6c-2 0-3.5 1.6-3.5 3.5v4.4c0 2 1.6 3.6 3.5 3.6h4.4c2 0 3.6-1.6 3.6-3.6V5.8c0-2-1.6-3.5-3.6-3.5H5.8Z"
    />
    <path fillRule="evenodd" clipRule="evenodd" fill="#1398E9" d="M12.7 13.8 2.5 3.6l.8-.8L13.5 13l-.8.8Z" />
    <path fill="#1398E9" d="M2.5 13.2 12.7 3l.8.8L3.3 14l-.8-.8Z" />
    <path stroke="#1398E9" d="M9.6 6.8H14M9.6 1.8v4.8M6.5 6.8H1.3M6.8 1.8V7M6.9 9.7H2.1M6.8 14.2V9.8M9.6 9.8h5" />
    <path stroke="#1398E9" d="M0-.6h4.4" transform="matrix(0 -1 -1 0 9 14.2)" />
  </svg>
);
