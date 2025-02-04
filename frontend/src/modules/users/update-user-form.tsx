import { zodResolver } from '@hookform/resolvers/zod';
import { isValidElement, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { updateUserBodySchema } from '#/modules/users/schema';

import type { UseFormProps } from 'react-hook-form';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import useHideElementsById from '~/hooks/use-hide-elements-by-id';
import AvatarFormField from '~/modules/common/form-fields/avatar';
import InputFormField from '~/modules/common/form-fields/input';
import { SelectLanguage } from '~/modules/common/form-fields/language-selector';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { sheet } from '~/modules/common/sheeter/state';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { createToast } from '~/modules/common/toaster';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useUpdateUserMutation } from '~/modules/users/query';
import type { User } from '~/modules/users/types';
import { useUserStore } from '~/store/user';
import { cleanUrl } from '~/utils/clean-url';

interface UpdateUserFormProps {
  user: User;
  callback?: (user: User) => void;
  sheet?: boolean;
  hiddenFields?: string[];
  children?: React.ReactNode;
}

const formSchema = updateUserBodySchema;

type FormValues = z.infer<typeof formSchema>;

const UpdateUserForm = ({ user, callback, sheet: isSheet, hiddenFields, children }: UpdateUserFormProps) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  const { user: currentUser, updateUser } = useUserStore();
  const isSelf = currentUser.id === user.id;

  // Hide fields if requested
  if (hiddenFields) {
    const fieldIds = hiddenFields.map((field) => `${field}-form-item-container`);
    useHideElementsById(fieldIds);
  }

  const { mutate, isPending } = useUpdateUserMutation(user.id);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        slug: user.slug,
        thumbnailUrl: cleanUrl(user.thumbnailUrl),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        language: user.language,
        newsletter: user.newsletter,
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>(`update-user-${user.id}`, formOptions);

  // Prevent data loss
  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    if (!user) return;

    mutate(values, {
      onSuccess: (updatedUser) => {
        if (isSelf) {
          updateUser(updatedUser);
          createToast(t('common:success.profile_updated'), 'success');
        } else createToast(t('common:success.update_item', { item: t('common:user') }), 'success');
        form.reset(updatedUser);
        if (isSheet) sheet.remove('update-user');
        nextStep?.();
        callback?.(updatedUser);
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('update-user');

      if (!targetSheet || !isValidElement(targetSheet.title)) return;
      // Check if the title's type is a function (React component) and not a string
      const { type: titleType } = targetSheet.title;

      if (typeof titleType !== 'function' || titleType.name === 'UnsavedBadge') return;
      sheet.update('update-user', {
        title: <UnsavedBadge title={targetSheet.title} />,
      });
    }
  }, [form.unsavedChanges]);

  const setImageUrl = (url: string | null) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        {!isSheet && form.unsavedChanges && <UnsavedBadge />}
        <AvatarFormField
          control={form.control}
          label={children ? '' : t('common:profile_picture')}
          type="user"
          name="thumbnailUrl"
          entity={user}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <div className="grid sm:grid-cols-2 gap-6 sm:gap-4">
          <InputFormField inputClassName="border" control={form.control} name="firstName" label={t('common:first_name')} required />
          <InputFormField inputClassName="border" control={form.control} name="lastName" label={t('common:last_name')} required />
        </div>
        {(!hiddenFields || !hiddenFields.includes('slug')) && (
          <SlugFormField
            control={form.control}
            type="user"
            label={t('common:resource_handle', { resource: t('common:user') })}
            description={t('common:user_handle.text')}
            previousSlug={user.slug}
          />
        )}

        <InputFormField
          inputClassName="border"
          control={form.control}
          value={user.email}
          name="email"
          label={t('common:email')}
          type="email"
          readOnly
          required
        />
        <FormField
          control={form.control}
          name="language"
          render={({ field: { onChange } }) => (
            <FormItem name="language">
              <FormLabel>
                {t('common:language')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormDescription>{t('common:placeholder.select_language')}</FormDescription>
              <FormControl>
                <SelectLanguage name="language" onChange={onChange} />
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
          {children}
          <SubmitButton
            disabled={!hiddenFields?.length && (!form.formState.isDirty || Object.keys(form.formState.errors).length > 0)}
            loading={isPending}
          >
            {t(`common:${hiddenFields?.length ? 'continue' : 'save_changes'}`)}
          </SubmitButton>
          {!children && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()} className={form.formState.isDirty ? '' : 'invisible'}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default UpdateUserForm;
