import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const sizeConfig = {
  sm: { icon: 'size-4', button: 'size-6' },
  md: { icon: 'size-5', button: 'size-7' },
  lg: { icon: 'size-6', button: 'size-8' },
} as const;

interface CloseButtonProps {
  onClick: () => void;
  size?: keyof typeof sizeConfig;
  className?: string;
}

export function CloseButton({ onClick, size = 'md', className }: CloseButtonProps) {
  const { t } = useTranslation();
  const { icon, button } = sizeConfig[size];

  return (
    <Button variant="ghost" size="icon" aria-label={t('c:close')} className={cn(button, 'opacity-70 hover:opacity-100', className)} onClick={onClick}>
      <XIcon className={icon} strokeWidth={1.5} />
    </Button>
  );
}
