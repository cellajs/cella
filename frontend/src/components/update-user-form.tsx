import { zodResolver } from '@hookform/resolvers/zod';
import { updateUserJsonSchema } from 'backend/schemas/user';
import config from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { User } from '~/types';

import CountryFlag from '~/components/country-flag';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import useBeforeUnload from '~/hooks/useBeforeUnload';

import { toast } from 'sonner';

import { useWatch } from 'react-hook-form';
import { checkSlug } from '~/api/api';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import useFormWithDraft from '~/hooks/useDraftForm';
import { useUpdateUserMutation } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { dialog } from './dialoger/state';
import { Textarea } from './ui/textarea';
import { UploadImage } from './upload-image';

interface Props {
  user: User;
  callback?: (user: User) => void;
  dialog?: boolean;
}

const formSchema = updateUserJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const UpdateUserForm = ({ user, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const { user: currentUser, setUser } = useUserStore();
  const isSelf = currentUser.id === user.id;

  const [apiWrapper, pending] = useApiWrapper();
  const updateUserMutation = useUpdateUserMutation(user.id);

  const form = useFormWithDraft<FormValues>(`update-user-${user.id}`, {
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: user.slug,
      thumbnailUrl: user.thumbnailUrl,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      language: user.language,
      newsletter: user.newsletter,
    },
  });

  const slug = useWatch({
    control: form.control,
    name: 'slug',
  });

  useBeforeUnload(form.formState.isDirty);

  const onSubmit = (values: FormValues) => {
    if (!user) return;

    apiWrapper(
      () => updateUserMutation.mutateAsync(values),
      async (result) => {
        form.reset(result);
        callback?.(user);

        //TODO: this function is executed every render when clicking upload image button, perhaps because of getValues("thumbnailUrl"), it should be executed only when the user is updated?
        if (isDialog) {
          dialog.remove();
        }

        if (isSelf) {
          setUser(result);
          toast.success(t('success.you_updated', { defaultValue: 'Your profile has been updated' }));
        } else toast.success(t('success.updated_user', { defaultValue: 'User updated' }));
      },
    );
  };

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const setImageUrl = (url: string) => {
    form.setValue('thumbnailUrl', url, { shouldDirty: true });
  };

  useEffect(() => {
    if (slug && slug !== user.slug) {
      apiWrapper(
        () => checkSlug(slug),
        (isExists) => {
          if (isExists) {
            form.setError('slug', {
              type: 'manual',
              message: t('error.slug_already_exists', {
                defaultValue: 'This username is already taken',
              }),
            });
          } else {
            form.clearErrors('slug');
          }
        },
      );
    }
  }, [slug]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        <FormField
          control={form.control}
          name="thumbnailUrl"
          render={({ field: { ref, ...rest } }) => (
            <FormItem>
              <FormLabel>
                {t('label.profile_picture', {
                  defaultValue: 'Profile picture',
                })}
              </FormLabel>
              <FormControl>
                <UploadImage {...rest} type="user" id={user.id} name={user.name} url={form.getValues('thumbnailUrl')} setUrl={setImageUrl} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('label.username', {
                  defaultValue: 'Username',
                })}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>
            {t('label.email', {
              defaultValue: 'Email',
            })}
          </FormLabel>
          <FormControl>
            <Input value={user.email} disabled />
          </FormControl>
          <FormMessage />
        </FormItem>
        <FormField
          control={form.control}
          name="firstName"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>
                {t('label.first_name', {
                  defaultValue: 'First name',
                })}
              </FormLabel>
              <FormControl>
                <Input value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>
                {t('label.last_name', {
                  defaultValue: 'Last name',
                })}
              </FormLabel>
              <FormControl>
                <Input value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field: { value, ...rest } }) => (
            <FormItem>
              <FormLabel>
                {t('label.bio', {
                  defaultValue: 'Bio',
                })}
              </FormLabel>
              <FormControl>
                <Textarea value={value ?? ''} {...rest} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="language"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>
                {t('label.language', {
                  defaultValue: 'Language',
                })}
              </FormLabel>
              <FormControl>
                <Select onValueChange={onChange} defaultValue={value ?? undefined}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.languages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        <CountryFlag countryCode={language.code} imgType="png" className="mr-2" />
                        {language.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newsletter"
          render={({ field }) => (
            <FormItem className="flex space-x-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>
                {t('label.newsletter', {
                  defaultValue: 'Newsletter',
                })}
              </FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex space-x-2">
          <Button type="submit" disabled={!form.formState.isDirty || Object.keys(form.formState.errors).length > 0} loading={pending}>
            {t('action.save_changes', {
              defaultValue: 'Save changes',
            })}
          </Button>
          {form.formState.isDirty && (
            <Button variant="secondary" onClick={cancel}>
              {t('action.cancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default UpdateUserForm;
