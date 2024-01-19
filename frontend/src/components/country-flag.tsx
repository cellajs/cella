import React from 'react';

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  countryCode: string;
  className?: string;
  imgType?: 'svg' | 'png';
}

export const CountryFlag = ({ countryCode, className, imgType = 'svg', width = 16, height = 12, ...props }: ImgProps) => {
  if (typeof countryCode !== 'string') return null;
  if (countryCode.toLowerCase() === 'en') countryCode = 'gb';

  const flagUrl = imgType === 'svg' ? `/flags/${countryCode.toLowerCase()}.svg` : `/flags/png/${countryCode.toLowerCase()}.png`;

  return (
    <img
      className={`inline overflow-hidden shadow-sm ${className}`}
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
