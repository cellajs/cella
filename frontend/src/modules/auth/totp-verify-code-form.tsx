import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateTotpBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type z from 'zod';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '~/modules/ui/totp';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zCreateTotpBody;
type FormValues = z.infer<typeof formSchema>;

interface Props {
  onSubmit: (data: FormValues) => void;
  onCancel: () => void;
  isPending?: boolean;
  label?: string;
}

/**
 * Collects and submits a TOTP verification code.
 */
export function TotpConfirmationForm({ onSubmit, onCancel, label, isPending }: Props) {
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
              {label && <FormLabel className="mb-1 justify-center text-center">{label}</FormLabel>}
              <FormControl>
                <InputOTP
                  value={value || ''}
                  {...rest}
                  autoFocus
                  disabled={isPending}
                  inputMode="numeric"
                  containerClassName="justify-center"
                  maxLength={appConfig.totp.digits}
                >
                  <InputOTPGroup>
                    {Array.from({ length: appConfig.totp.digits }).map((_, index) => (
                      <InputOTPSlot
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP slots, never reordered.
                        key={index}
                        inputMode="numeric"
                        index={index}
                        className="bg-background text-lg sm:h-12 sm:w-10"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex w-full flex-col items-stretch gap-2">
          <SubmitButton disabled={!isValid} loading={isPending}>
            {t('c:confirm')}
          </SubmitButton>

          <Button type="reset" variant="secondary" onClick={clearOrCancel}>
            {isDirty ? t('c:clear') : t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
