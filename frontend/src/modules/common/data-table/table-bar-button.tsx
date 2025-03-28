import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, forwardRef } from 'react';
import slugify from 'slugify';
import { Badge } from '~/modules/ui/badge';
import { Button, type ButtonProps } from '~/modules/ui/button';

type Props = {
  icon: LucideIcon;
  label: string;
  badge?: ReactNode;
} & ButtonProps;

export const TableBarButton = forwardRef<HTMLButtonElement, Props>(({ icon: Icon, label, badge, className, ...props }, ref) => {
  const id = slugify(label, { lower: true, strict: true });
  return (
    <Button asChild {...props}>
      <motion.button
        ref={ref}
        layout="size"
        layoutId={id}
        className={className}
        transition={{ bounce: 0, duration: 0.3, ease: 'easeOut' }}
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -20, opacity: 0 }}
      >
        {Icon && <motion.span className="flex items-center">{<Icon size={16} />}</motion.span>}
        {label && <span className="ml-1">{label}</span>}

        {badge && <Badge context="button">{badge}</Badge>}
      </motion.button>
    </Button>
  );
});
