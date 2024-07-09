import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const DeliveredIcon = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
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
    <g clip-path="url(#clip0_179_6302)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5.41769 0.666687C2.79368 0.666687 0.666504 2.79387 0.666504 5.41788V10.5822C0.666504 13.2062 2.79369 15.3334 5.4177 15.3334H10.582C13.206 15.3334 15.3332 13.2062 15.3332 10.5822V5.41787C15.3332 2.79387 13.206 0.666687 10.582 0.666687H5.41769ZM5.81985 2.25228C3.84953 2.25228 2.25228 3.84954 2.25228 5.81985V10.1802C2.25228 12.1505 3.84954 13.7478 5.81985 13.7478H10.1802C12.1505 13.7478 13.7478 12.1505 13.7478 10.1802V5.81985C13.7478 3.84953 12.1505 2.25228 10.1802 2.25228H5.81985Z"
        fill="#F2BE00"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M6.00016 3.94115V7.71532C6.00016 7.82837 6.13201 7.89012 6.21885 7.81775L7.91479 6.40446C7.96423 6.36326 8.03606 6.36326 8.0855 6.40446L9.78147 7.81776C9.86832 7.89013 10.0002 7.82837 10.0002 7.71533V3.93585C11.2238 4.18632 12.1443 5.26903 12.1443 6.56672V9.45872C12.1443 10.9419 10.9419 12.1442 9.4588 12.1442H6.5668C5.08366 12.1442 3.88135 10.9419 3.88135 9.45872V6.56672C3.88135 5.27798 4.78914 4.20127 6.00016 3.94115Z"
        fill="#F2BE00"
      />
    </g>
    <defs>
      <clipPath id="clip0_179_6302">
        <rect width="16" height="16" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
