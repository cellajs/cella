import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateTotpBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Button } from '~/modules/ui/button';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '~/modules/ui/totp';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';

const formSchema = zCreateTotpBody;
type FormValues = z.infer<typeof formSchema>;

interface TotpConfirmationFormProps {
  onSubmit: (data: FormValues) => void;
  onCancel: () => void;
  /** While the code is checked: the field is disabled and Confirm shows its spinner. */
  loading?: boolean;
  /** Defaults to `c:totp_verify`. */
  label?: string;
}

export function TotpConfirmationForm({ onSubmit, onCancel, loading, label }: TotpConfirmationFormProps) {
  const { t } = useTranslation();

  const form = useForm<FormValues>({ resolver: formResolver(formSchema), defaultValues: { code: '' } });

  const { isValid, isDirty } = useFormState({ control: form.control });

  const clearOrCancel = () => {
    if (isDirty) form.reset();
    else onCancel();
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit((data) => onSubmit(data), defaultOnInvalid)}>
        <FormField
          control={form.control}
          name="code"
          render={({ field: { value, onChange, onBlur, name, ref } }) => (
            <FormItem name="code" className="mb-6">
              <FormLabel className="mb-1 self-center">{label ?? t('c:totp_verify')}</FormLabel>
              {/* OTPField reads the surrounding Field itself, so it binds to the form value directly. */}
              <InputOTP
                name={name}
                value={value || ''}
                onValueChange={onChange}
                onBlur={onBlur}
                disabled={loading}
                length={appConfig.totp.digits}
                className="justify-center"
              >
                <InputOTPGroup>
                  {Array.from({ length: appConfig.totp.digits }).map((_, index) => (
                    <InputOTPSlot
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP slots, never reordered.
                      key={index}
                      ref={index === 0 ? ref : undefined}
                      autoFocus={index === 0}
                      className="text-lg sm:h-12 sm:w-10"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <SubmitButton disabled={!isValid} loading={loading}>
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
