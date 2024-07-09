import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const ReviewedIcon = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
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
    <g clip-path="url(#clip0_179_6315)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5.41769 0.666687C2.79368 0.666687 0.666504 2.79387 0.666504 5.41788V10.5822C0.666504 13.2062 2.79369 15.3334 5.4177 15.3334H10.582C13.206 15.3334 15.3332 13.2062 15.3332 10.5822V5.41787C15.3332 2.79387 13.206 0.666687 10.582 0.666687H5.41769ZM5.81985 2.25228C3.84953 2.25228 2.25228 3.84954 2.25228 5.81985V10.1802C2.25228 12.1505 3.84954 13.7478 5.81985 13.7478H10.1802C12.1505 13.7478 13.7478 12.1505 13.7478 10.1802V5.81985C13.7478 3.84953 12.1505 2.25228 10.1802 2.25228H5.81985Z"
        fill="#C14A00"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M3.88135 6.56674C3.88135 5.0836 5.08367 3.88129 6.5668 3.88129H9.45881C10.9419 3.88129 12.1443 5.08361 12.1443 6.56674V9.45875C12.1443 10.9419 10.9419 12.1442 9.4588 12.1442H6.5668C5.08366 12.1442 3.88135 10.9419 3.88135 9.45874V6.56674ZM10.9809 6.31427C11.1545 6.1407 11.1545 5.8593 10.9809 5.68573C10.8074 5.51216 10.526 5.51216 10.3524 5.68573L7.11111 8.92702L5.6476 7.46351C5.47404 7.28994 5.19263 7.28994 5.01906 7.46351C4.8455 7.63707 4.8455 7.91848 5.01906 8.09205L6.79684 9.86983L7.11111 10.1841L7.42538 9.86983L10.9809 6.31427Z"
        fill="#C14A00"
      />
    </g>
    <defs>
      <clipPath id="clip0_179_6315">
        <rect width="16" height="16" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
