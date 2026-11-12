import { XIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

const sizeConfig = { sm: { icon: 'size-4', button: 'icon-micro' }, md: { icon: 'size-5', button: 'icon-xs' } } as const;

interface CloseButtonProps {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  size?: keyof typeof sizeConfig;
  className?: string;
}

export function CloseButton({ onClick, size = 'md', className }: CloseButtonProps) {
  const { t } = useTranslation();
  const { icon, button } = sizeConfig[size];

  return (
    <Button variant="ghost" size={button} aria-label={t('c:close')} className={className} onClick={onClick}>
      <XIcon className={icon} />
    </Button>
  );
}
