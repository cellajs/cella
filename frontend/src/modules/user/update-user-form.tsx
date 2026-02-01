import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { User } from '~/api.gen';
import { zUpdateUserData } from '~/api.gen/zod.gen';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import useHideElementsById from '~/hooks/use-hide-elements-by-id';
import { CallbackArgs } from '~/modules/common/data-table/types';
import AvatarFormField from '~/modules/common/form-fields/avatar';
import InputFormField from '~/modules/common/form-fields/input';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useStepper } from '~/modules/common/stepper';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { useUserUpdateMutation } from '~/modules/user/query';
import { useUserStore } from '~/store/user';

const formSchema = zUpdateUserData.shape.body.unwrap();

type FormValues = z.infer<typeof formSchema>;
interface UpdateUserFormProps {
  user: User;
  sheet?: boolean;
  hiddenFields?: string[];
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<User>) => void;
}

function UpdateUserForm({ user, callback, sheet: isSheet, hiddenFields, children }: UpdateUserFormProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === user.id;
  const { nextStep } = useStepper();

  // Hide fields if requested
  if (hiddenFields) {
    const fieldIds = hiddenFields.map((field) => `${field}-form-item-container`);
    useHideElementsById(fieldIds);
  }

  const mutationFn = isSelf ? useUpdateSelfMutation : useUserUpdateMutation;
  const { mutate, isPending } = mutationFn();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: user,
    }),
    [],
  );

  const formContainerId = 'update-user';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${user.id}`, { formOptions, formContainerId });

  // Prevent data loss
  useBeforeUnload(form.isDirty);

  const onSubmit = (values: FormValues) => {
    if (!user) return;

    mutate(
      { idOrSlug: user.id, ...values },
      {
        onSuccess: (updatedUser) => {
          const message = isSelf
            ? t('common:success.profile_updated')
            : t('common:success.update_item', { item: t('common:user') });
          toaster(message, 'success');

          form.reset(updatedUser);
          if (isSheet) useSheeter.getState().remove(formContainerId);

          // Since this form is also used in onboarding, we need to call the next step
          // This should ideally be done through the callback, but we need to refactor stepper
          nextStep?.();

          callback?.({ data: updatedUser, status: 'success' });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        <AvatarFormField
          form={form}
          label={children ? '' : t('common:profile_picture')}
          type="user"
          name="thumbnailUrl"
          entity={user}
        />
        <div className="grid sm:grid-cols-2 gap-6 sm:gap-4">
          <InputFormField
            inputClassName="border"
            control={form.control}
            name="firstName"
            label={t('common:first_name')}
            required
          />
          <InputFormField
            inputClassName="border"
            control={form.control}
            name="lastName"
            label={t('common:last_name')}
            required
          />
        </div>
        {(!hiddenFields || !hiddenFields.includes('slug')) && (
          <SlugFormField
            control={form.control}
            entityType="user"
            label={t('common:resource_handle', { resource: t('common:user') })}
            description={t('common:user_handle.text')}
            previousSlug={user.slug}
          />
        )}

        <div id="email-form-item-container" className="flex-col flex gap-2">
          <Label>{t('common:email')}</Label>
          <Input value={user.email} autoComplete="off" disabled />
        </div>

        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem name="language">
              <FormLabel>
                {t('common:language')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectLanguage
                  options={[...appConfig.languages]}
                  value={field.value ?? appConfig.defaultLanguage}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newsletter"
          render={({ field }) => (
            <FormItem className="flex-row items-center" name="newsletter">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>{t('common:newsletter')}</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton
            disabled={!hiddenFields?.length && (!form.isDirty || Object.keys(form.formState.errors).length > 0)}
            loading={isPending}
          >
            {t(`common:${hiddenFields?.length ? 'continue' : 'save_changes'}`)}
          </SubmitButton>
          {!children && (
            <Button
              type="reset"
              variant="secondary"
              onClick={() => form.reset()}
              className={form.isDirty ? '' : 'invisible'}
            >
              {t('common:cancel')}
            </Button>
          )}
          {children}
        </div>
      </form>
    </Form>
  );
}

export default UpdateUserForm;
