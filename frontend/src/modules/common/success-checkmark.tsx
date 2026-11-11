import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';
import '~/modules/common/success-checkmark.css';

interface SuccessCheckmarkProps {
  /** A size-* class sizes it; placement is the caller's. */
  className?: string;
}

export function SuccessCheckmark({ className }: SuccessCheckmarkProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('success-checkmark size-12.5', className)}>
      <svg
        className="block size-full rounded-full shadow-[inset_0_0_0_var(--success)] [stroke-miterlimit:10]"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 52 52"
        role="img"
        aria-label={t('c:success')}
      >
        <circle
          className="stroke-success fill-white stroke-4 [stroke-dasharray:166] [stroke-dashoffset:166] [stroke-miterlimit:10]"
          cx="26"
          cy="26"
          r="25"
        />
        <path
          className="stroke-success origin-center stroke-4 [stroke-dasharray:48] [stroke-dashoffset:48]"
          fill="none"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
        />
      </svg>
    </div>
  );
}
