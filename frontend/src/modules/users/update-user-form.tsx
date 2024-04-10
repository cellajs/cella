import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultError, useMutation } from '@tanstack/react-query';
import { updateUserJsonSchema } from 'backend/modules/users/schema';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { User } from '~/types';
import AvatarFormField from '../common/form-fields/avatar';

import { type UpdateUserParams, updateUser } from '~/api/users';

import { Undo } from 'lucide-react';
import { toast } from 'sonner';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

import { type UseFormProps, useForm, useWatch } from 'react-hook-form';
import { checkSlugAvailable } from '~/api/general';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import useHideElementsById from '~/hooks/use-hide-elements-by-id';
import { queryClient } from '~/lib/router';
import { cleanUrl } from '~/lib/utils';
import { useUserStore } from '~/store/user';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import LanguageFormField from '../common/form-fields/language';

interface Props {
  user: User;
  callback?: (user: User) => void;
  dialog?: boolean;
  withDraft?: boolean;
  initValues?: FormValues | null;
  onValuesChange?: (values: FormValues | null) => void;
  hiddenFields?: string[];
  withButtons?: boolean;
}

const formSchema = updateUserJsonSchema;

type FormValues = z.infer<typeof formSchema>;

export const useUpdateUserMutation = (userIdentifier: string) => {
  return useMutation<User, DefaultError, UpdateUserParams>({
    mutationKey: ['me', 'update', userIdentifier],
    mutationFn: (params) => updateUser(userIdentifier, params),
    onSuccess: (user) => {
      queryClient.setQueryData(['users', user.id], user);
    },
    gcTime: 1000 * 10,
  });
};

const UpdateUserForm = ({
  user,
  callback,
  dialog: isDialog,
  initValues,
  onValuesChange,
  hiddenFields,
  withButtons = true,
  withDraft = true,
}: Props) => {
  const { t } = useTranslation();
  const { user: currentUser, setUser } = useUserStore();
  const isSelf = currentUser.id === user.id;

  // Hide fields if requested
  if (hiddenFields) {
    const fieldIds = hiddenFields.map((field) => `${field}-form-item-container`);
    useHideElementsById(fieldIds);
  }

  const { mutate, isPending } = useUpdateUserMutation(user.id);
  const { mutate: checkSlug, isPending: isCheckPending } = useMutation({
    mutationFn: checkSlugAvailable,
    onSuccess: (isAvailable) => {
      if (!isAvailable) {
        form.setError('slug', {
          type: 'manual',
          message: t('common:error.slug_exists'),
        });
      } else {
        form.clearErrors('slug');
      }
    },
  });

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        slug: user.slug,
        thumbnailUrl: cleanUrl(user.thumbnailUrl),
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        language: user.language,
        newsletter: user.newsletter,
      },
    }),
    [],
  );

  const form = withDraft ? useFormWithDraft<FormValues>('create-organization', formOptions) : useForm<FormValues>(formOptions);

  const allFields = useWatch({ control: form.control });

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

        form.reset(data);
        callback?.(data);

        //TODO: this function is executed every render when clicking upload image button, perhaps because of getValues("thumbnailUrl"), it should be executed only when the user is updated?
        if (isDialog) {
          dialog.remove();
        }
      },
    });
  };

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  const revertSlug = () => {
    form.resetField('slug');
  };

  useEffect(() => {
    if (allFields.slug && allFields.slug !== user.slug) {
      checkSlug(allFields.slug);
    }
  }, [allFields.slug]);

  // Set initial values
  useEffect(() => {
    if (initValues) {
      for (const [key, value] of Object.entries(initValues)) {
        form.setValue(key as keyof FormValues, value, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }
  }, []);

  useEffect(() => {
    onValuesChange?.(form.formState.isDirty ? (allFields as FormValues) : null);
  }, [onValuesChange, allFields]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        <AvatarFormField
          control={form.control}
          label={t('common:profile_picture')}
          type="user"
          name="thumbnailUrl"
          entity={user}
          url={form.getValues('thumbnailUrl')}
          setUrl={setImageUrl}
        />
        <InputFormField
          control={form.control}
          name="slug"
          required
          label={t('common:user_handle')}
          description={t('common:user_handle.text')}
          subComponent={
            user.slug !== allFields.slug && (
              <div className="absolute inset-y-1 right-1 flex justify-end">
                <Button variant="ghost" size="sm" aria-label="Revert to current user handle" onClick={revertSlug} className="h-full">
                  <Undo size={16} className="mr-2" /> Revert to <strong className="ml-1">{user.slug}</strong>
                </Button>
              </div>
            )
          }
        />
        <InputFormField control={form.control} value={user.email} name="email" label={t('common:email')} type="email" disabled required />
        <InputFormField control={form.control} name="firstName" label={t('common:first_name')} required />
        <InputFormField control={form.control} name="lastName" label={t('common:last_name')} required />
        <InputFormField control={form.control} name="bio" label={t('common:bio')} type="textarea" />
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
            <FormItem className="flex-row">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>{t('common:newsletter')}</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />
        {withButtons && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="submit"
              disabled={!form.formState.isDirty || Object.keys(form.formState.errors).length > 0}
              loading={isPending || isCheckPending}
            >
              {t('common:save_changes')}
            </Button>
            <Button type="reset" variant="secondary" onClick={cancel} className={form.formState.isDirty ? '' : 'sm:invisible'}>
              {t('common:cancel')}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
};

export default UpdateUserForm;
