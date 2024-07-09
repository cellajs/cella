import type { SVGProps } from 'react';
import type { SVGRProps } from './types';

export const IcedIcon = ({ title, titleId, desc, descId, ...props }: SVGProps<SVGSVGElement> & SVGRProps) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.42362 0.667358C2.79688 0.667358 0.66748 2.79675 0.66748 5.4235V10.5932C0.66748 13.2199 2.79688 15.3493 5.42362 15.3493H10.5933C13.22 15.3493 15.3494 13.2199 15.3494 10.5932V5.4235C15.3494 2.79675 13.22 0.667358 10.5933 0.667358H5.42362ZM5.82591 2.25462C3.85354 2.25462 2.25462 3.85354 2.25462 5.82591V10.1908C2.25462 12.1632 3.85354 13.7621 5.82591 13.7621H10.1908C12.1632 13.7621 13.7621 12.1632 13.7621 10.1908V5.82591C13.7621 3.85354 12.1632 2.25462 10.1908 2.25462H5.82591Z"
      fill="#1398E9"
    />
    <path fillRule="evenodd" clipRule="evenodd" d="M12.6607 13.7722L2.52346 3.63493L3.32568 2.8327L13.4629 12.9699L12.6607 13.7722Z" fill="#1398E9" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.52342 13.1787L12.6607 3.04147L13.4629 3.84369L3.32565 13.9809L2.52342 13.1787Z"
      fill="#1398E9"
    />
    <path d="M9.63965 6.81982H13.8833" stroke="#1398E9" strokeWidth="1.13451" />
    <path d="M9.64014 1.83221L9.64014 6.61372" stroke="#1398E9" strokeWidth="1.13451" />
    <path d="M6.49512 6.81995H1.31515" stroke="#1398E9" strokeWidth="1.13451" />
    <path d="M6.75146 1.83228L6.75147 7.01224" stroke="#1398E9" strokeWidth="1.13451" />
    <line x1="6.93945" y1="9.70129" x2="2.11112" y2="9.70129" stroke="#1398E9" strokeWidth="1.13451" />
    <line x1="6.76673" y1="14.1844" x2="6.76673" y2="9.80134" stroke="#1398E9" strokeWidth="1.13451" />
    <path d="M9.64014 9.80127L14.6209 9.80127" stroke="#1398E9" strokeWidth="1.13451" />
    <line
      y1="-0.567257"
      x2="4.38305"
      y2="-0.567257"
      transform="matrix(-4.35937e-08 -1 -1 4.38294e-08 8.91846 14.1844)"
      stroke="#1398E9"
      strokeWidth="1.13451"
    />
  </svg>
);
