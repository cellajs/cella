import { cva } from 'class-variance-authority';
import { Clock, Shield, ShieldCheck, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Session } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';

const badgeVariants = cva('uppercase text-[10px] py-0 flex items-center gap-1', {
  variants: {
    variant: {
      regular: 'text-green-600 border-green-600',
      confirm_mfa: 'text-orange-500 border-orange-500',
      mfa: 'text-green-600 border-green-600',
      impersonation: 'text-purple-500 border-purple-500',
    },
  },
});

export const SessionBadge = ({ sessionType }: { sessionType: Session['type'] }) => {
  const { t } = useTranslation();

  const badgeIcons = {
    regular: <Shield size={12} />,
    confirm_mfa: <Clock size={12} />,
    mfa: <ShieldCheck size={12} />,
    impersonation: <User size={12} />,
  };

  return (
    <Badge size="sm" variant="outline" className={badgeVariants({ variant: sessionType })}>
      {badgeIcons[sessionType]}
      {t(`common:session_type.${sessionType}`)}
    </Badge>
  );
};
