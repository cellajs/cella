import type { ImgHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { cn } from '~/utils/cn';

interface CountryFlagProps extends ImgHTMLAttributes<HTMLImageElement> {
  countryCode: string;
  imgType?: 'svg' | 'png';
}

export function CountryFlag({ countryCode, className, imgType = 'svg', width = 16, height = 12, ...props }: CountryFlagProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  if (typeof countryCode !== 'string') return null;

  const code = countryCode.toLowerCase() === 'en' ? 'gb' : countryCode.toLowerCase();
  const flagUrl = imgType === 'svg' ? `/static/common/flags/${code}.svg` : `/static/common/flags/png/${code}.png`;

  if (!isOnline) return null;
  return (
    <img
      className={cn('inline overflow-hidden shadow-xs', className)}
      draggable={false}
      {...props}
      src={flagUrl}
      alt={t('c:country_flag', { country: code.toUpperCase() })}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
    />
  );
}
