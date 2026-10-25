import { useTranslation } from 'react-i18next';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface CancelButtonProps extends ButtonProps {
  /** Shows the button; for a clean form it keeps its place, unseen. */
  dirty: boolean;
}

/** A form's cancel button, shown once the form has changes. */
export function CancelButton({ dirty, className, ...props }: CancelButtonProps) {
  const { t } = useTranslation();

  return (
    <Button type="reset" variant="secondary" className={cn(!dirty && 'invisible', className)} {...props}>
      {t('c:cancel')}
    </Button>
  );
}
