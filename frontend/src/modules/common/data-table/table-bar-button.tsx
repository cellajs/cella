import { motion } from 'motion/react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { scaleInMotion } from '~/modules/common/motion-presets';
import { Badge } from '~/modules/ui/badge';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { formatCount } from '~/utils/format-count';

interface TableBarButtonProps extends ButtonProps {
  icon: IconComponent;
  label: TKey;
  badge?: number;
  ref?: Ref<HTMLButtonElement>;
}

export function TableBarButton({ icon: Icon, label, badge, className, ref, ...props }: TableBarButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      {...props}
      // The badge sits on the button's corner
      className={cn('relative', className)}
      render={<motion.button ref={ref} {...scaleInMotion} exit={{ scale: 0.6, opacity: 0 }} />}
    >
      <Icon />
      {t(label)}

      {!!badge && <Badge context="button">{formatCount(badge)}</Badge>}
    </Button>
  );
}
