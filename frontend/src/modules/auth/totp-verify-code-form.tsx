import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { zCreateTotpData } from '~/api.gen/zod.gen';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '~/modules/ui/totp';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zCreateTotpData.shape.body;
type FormValues = z.infer<typeof formSchema>;

interface Props {
  onSubmit: (data: FormValues) => void;
  onCancel: () => void;
  isPending?: boolean;
  label?: string;
}

export const TotpConfirmationForm = ({ onSubmit, onCancel, label, isPending }: Props) => {
  const { t } = useTranslation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });

  const { isValid, isDirty } = useFormState({ control: form.control });

  const handleSubmit = (data: FormValues) => {
    onSubmit(data);
  };

  const clearOrCancel = () => {
    if (isDirty) form.reset();
    else onCancel();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, defaultOnInvalid)}>
        <FormField
          control={form.control}
          name="code"
          render={({ field: { value, ...rest } }) => (
            <FormItem name="code" className="mb-6">
              {label && <FormLabel className="mb-1 text-center justify-center">{label}</FormLabel>}
              <FormControl>
                <InputOTP
                  value={value || ''}
                  {...rest}
                  autoFocus
                  disabled={isPending}
                  inputMode="numeric"
                  containerClassName="justify-center"
                  maxLength={appConfig.totpConfig.digits}
                >
                  <InputOTPGroup>
                    {Array.from({ length: appConfig.totpConfig.digits }).map((_, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list
                      <InputOTPSlot
                        key={index}
                        inputMode="numeric"
                        index={index}
                        className="sm:h-12 bg-background sm:w-10 text-lg"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="w-full flex flex-col items-stretch gap-2">
          <SubmitButton disabled={!isValid} loading={isPending}>
            {t('common:confirm')}
          </SubmitButton>

          <Button type="reset" variant="secondary" onClick={clearOrCancel}>
            {isDirty ? t('common:clear') : t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
