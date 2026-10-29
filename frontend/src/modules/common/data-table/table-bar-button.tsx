import { motion } from 'motion/react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
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
      render={
        <motion.button
          ref={ref}
          transition={{ bounce: 0, duration: 0.3, ease: 'easeOut' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
        />
      }
    >
      <Icon />
      {/* A phone bar that also holds a view toggle marks its actions `data-compact`, leaving them their icon */}
      <span className="max-sm:in-data-compact:sr-only">{t(label)}</span>

      {!!badge && <Badge context="button">{formatCount(badge)}</Badge>}
    </Button>
  );
}
