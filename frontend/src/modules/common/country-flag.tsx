import type { ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { cn } from '~/utils/cn';
import { regionName } from '~/utils/region-name';

interface CountryFlagProps extends ImgHTMLAttributes<HTMLImageElement> {
  countryCode: string;
  imgType?: 'svg' | 'png';
  /** Defaults to the country's name, also shown on hover; `''` where the name is written beside the flag. */
  alt?: string;
}

export function CountryFlag({ countryCode, className, imgType = 'svg', width = 16, height = 12, style, alt, ...props }: CountryFlagProps) {
  const { i18n } = useTranslation();
  const isOnline = useOnlineManager();

  if (typeof countryCode !== 'string') return null;

  const code = countryCode.toLowerCase() === 'en' ? 'gb' : countryCode.toLowerCase();
  const flagUrl = imgType === 'svg' ? `/static/common/flags/${code}.svg` : `/static/common/flags/png/${code}.png`;
  const label = alt ?? regionName(code.toUpperCase(), i18n.language);

  if (!isOnline) return null;
  return (
    <img
      className={cn('inline object-contain shadow-xs', className)}
      draggable={false}
      title={label || undefined}
      {...props}
      src={flagUrl}
      alt={label}
      width={width}
      height={height}
      // Tailwind's preflight gives images `height: auto`, which Chrome's lazy-image audit reads as no explicit size, so the box is sized in CSS too
      style={{ width, height, ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}
