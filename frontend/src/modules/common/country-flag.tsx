import type React from 'react';
import { cn } from '~/utils/cn';

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  countryCode: string;
  className?: string;
  imgType?: 'svg' | 'png';
}

export const CountryFlag = ({ countryCode, className, imgType = 'svg', width = 16, height = 12, ...props }: ImgProps) => {
  if (typeof countryCode !== 'string') return null;
  if (countryCode.toLowerCase() === 'en') countryCode = 'gb';

  const flagUrl = imgType === 'svg' ? `/static/flags/${countryCode.toLowerCase()}.svg` : `/static/flags/png/${countryCode.toLowerCase()}.png`;

  return (
    <img
      className={cn('inline overflow-hidden shadow-sm', className)}
      {...props}
      src={flagUrl}
      alt={`Flag of ${countryCode.toUpperCase()}`}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
    />
  );
};

export default CountryFlag;
