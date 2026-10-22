import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCheckEmailBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';

export const emailFormSchema = zCheckEmailBody;
export type EmailFormValues = z.infer<typeof emailFormSchema>;

interface EmailFieldProps {
  control: Control<EmailFormValues>;
  /** The address of an earlier step, kept in the form but out of view, the tab order and autofill. */
  hidden?: boolean;
  className?: string;
}

/** The address field of the email steps. */
export function EmailField({ control, hidden = false, className }: EmailFieldProps) {
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name="email"
      render={({ field }) => (
        // Custom css due to html injection by browser extensions
        <FormItem className={cn('gap-0', hidden && 'hidden', className)}>
          {/* Hidden on purpose: the example address is the visible cue */}
          <FormLabel className="sr-only">{t('c:email')}</FormLabel>
          <FormControl>
            <Input
              {...field}
              disabled={hidden}
              type="email"
              className="h-12"
              autoFocus={!hidden && !isTouchInteraction()}
              autoComplete={hidden ? 'off' : 'email'}
              placeholder="name@example.com"
            />
          </FormControl>
          <FormMessage className="mt-2" />
        </FormItem>
      )}
    />
  );
}
