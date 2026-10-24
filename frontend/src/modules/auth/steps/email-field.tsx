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
}

/** The address field of the email steps. */
export function EmailField({ control, hidden = false }: EmailFieldProps) {
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name="email"
      render={({ field }) => (
        // Spacing by margin: a gap would add space around every node a browser extension injects
        <FormItem className={cn('gap-0', hidden && 'hidden')}>
          {/* Hidden on purpose: the placeholder is the visible cue */}
          <FormLabel className="sr-only">{t('c:email')}</FormLabel>
          <FormControl>
            <Input
              {...field}
              disabled={hidden}
              type="email"
              className="h-12"
              autoFocus={!hidden && !isTouchInteraction()}
              autoComplete={hidden ? 'off' : 'email'}
              placeholder={t('c:your_email_address')}
            />
          </FormControl>
          <FormMessage className="mt-2" />
        </FormItem>
      )}
    />
  );
}
