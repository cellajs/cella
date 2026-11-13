import { useTranslation } from 'react-i18next';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface CancelButtonProps extends ButtonProps {
  /** Shows the button; for a clean form it keeps its place unseen, except in a `FormActions` row, where the submit button takes it. */
  dirty: boolean;
}

/** A form's cancel button, shown once the form has changes; in a `FormActions` row on a phone it slides in and out. */
export function CancelButton({ dirty, className, ...props }: CancelButtonProps) {
  const { t } = useTranslation();

  return (
    <div data-open={dirty || undefined} className="form-actions-reveal not-data-open:invisible">
      <div>
        <Button type="reset" variant="secondary" className={cn('shrink-0', !dirty && 'sm:in-data-form-actions:hidden', className)} {...props}>
          {t('c:cancel')}
        </Button>
      </div>
    </div>
  );
}
