import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { zActivateTotpData } from '~/api.gen/zod.gen';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zActivateTotpData.shape.body;
type FormValues = z.infer<typeof formSchema>;

interface Props {
  formClassName?: string;
  label?: string;
  onSubmit: (data: FormValues) => void;
}

export const TotpConfirmationForm = ({ formClassName, label, onSubmit }: Props) => {
  const { t } = useTranslation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });

  const { isValid, isDirty } = useFormState({ control: form.control });

  const handleSubmit = (data: FormValues) => {
    useDialoger.getState().remove('mfa-confirmation');
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, defaultOnInvalid)} className={cn('flex flex-col gap-4 items-center', formClassName)}>
        <FormField
          control={form.control}
          name="code"
          render={({ field: { value, ...rest } }) => (
            <FormItem name="code">
              {label && <FormLabel className="mb-1">{label}</FormLabel>}
              <FormControl>
                <Input
                  className="text-center"
                  autoComplete="off"
                  maxLength={appConfig.totpConfig.digits}
                  type="text"
                  pattern="\d*"
                  inputMode="numeric"
                  value={value || ''}
                  {...rest}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-row gap-2">
          <SubmitButton size="sm" variant="darkSuccess" disabled={!isValid} loading={false}>
            {t('common:confirm')}
          </SubmitButton>

          <Button size="sm" type="reset" variant="secondary" disabled={!isDirty} onClick={() => form.reset()}>
            {t('common:clear')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
