import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { updateUserJsonSchema } from 'backend/modules/users/schema';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { User } from '~/types';
import AvatarFormField from '../common/form-fields/avatar';

import { type UpdateUserParams, updateUser } from '~/api/users';
import { updateSelf } from '~/api/me';

import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

import type { UseFormProps } from 'react-hook-form';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import useHideElementsById from '~/hooks/use-hide-elements-by-id';
import { queryClient } from '~/lib/router';
import { cleanUrl } from '~/lib/utils';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { useUserStore } from '~/store/user';
import InputFormField from '../common/form-fields/input';
import LanguageFormField from '../common/form-fields/language';
import { SlugFormField } from '../common/form-fields/slug';
import { isSheet as checkSheet, sheet } from '../common/sheeter/state';
import { useStepper } from '../common/stepper/use-stepper';

interface UpdateUserFormProps {
  user: User;
  callback?: (user: User) => void;
  sheet?: boolean;
  hiddenFields?: string[];
  children?: React.ReactNode;
}

const formSchema = updateUserJsonSchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateUserMutation = (idOrSlug: string) => {
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === idOrSlug;

  return useMutation<User, DefaultError, UpdateUserParams>({
    mutationKey: ['me', 'update', idOrSlug],
    mutationFn: (params) => (isSelf ? updateSelf(params) : updateUser(idOrSlug, params)),
    onSuccess: (user) => {
      queryClient.setQueryData(['users', user.id], user);
    },
    gcTime: 1000 * 10,
  });
};

const UpdateUserForm = ({ user, callback, sheet: isSheet, hiddenFields, children }: UpdateUserFormProps) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  
  const { user: currentUser, setUser } = useUserStore();
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
        bio: user.bio,
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
      onSuccess: (data) => {
        if (isSelf) {
          setUser(data);
          toast.success(t('common:success.you_updated'));
        } else {
          toast.success(t('common:success.updated_user'));
        }
        //TODO: this function is executed every render when clicking upload image button, perhaps because of getValues("thumbnailUrl"), it should be executed only when the user is updated?
        if (isSheet) sheet.remove('edit-user');

        form.reset(data);
        callback?.(data);

        nextStep?.();
      },
    });
  };

  // Update sheet title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetSheet = sheet.get('edit-user');
      if (targetSheet && checkSheet(targetSheet)) {
        sheet.update('edit-user', {
          title: <UnsavedBadge title={targetSheet?.title} />,
        });
      }
      return;
    }
    sheet.reset('edit-user');
  }, [form.unsavedChanges]);

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        <AvatarFormField
          control={form.control}
          label={t('common:profile_picture')}
          type="USER"
          name="thumbnailUrl"
          entity={user}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <div className="grid sm:grid-cols-2 gap-6 sm:gap-4">
          <InputFormField inputClassName="border" control={form.control} name="firstName" label={t('common:first_name')} required />
          <InputFormField inputClassName="border" control={form.control} name="lastName" label={t('common:last_name')} required />
        </div>
        <SlugFormField
          control={form.control}
          type="USER"
          label={t('common:user_handle')}
          description={t('common:user_handle.text')}
          previousSlug={user.slug}
        />
        <InputFormField
          inputClassName="border"
          control={form.control}
          value={user.email}
          name="email"
          label={t('common:email')}
          type="email"
          disabled
          required
        />
        <InputFormField inputClassName="border" control={form.control} name="bio" label={t('common:bio')} type="textarea" />
        <LanguageFormField
          control={form.control}
          name="language"
          label={t('common:language')}
          placeholder={t('common:placeholder.select_language')}
          required
        />
        <FormField
          control={form.control}
          name="newsletter"
          render={({ field }) => (
            <FormItem className="flex-row" name="newsletter">
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
          <Button type="submit" disabled={!form.formState.isDirty || Object.keys(form.formState.errors).length > 0} loading={isPending}>
            {t('common:save_changes')}
          </Button>
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
