import { useMutation } from '@tanstack/react-query';
import { appConfig, type EntityType } from 'config';
import { UndoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FieldValues, type Path, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import slugify from 'slugify';
import { checkSlug, type CheckSlugData, CheckSlugResponse } from '~/api.gen';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { ApiError } from '~/lib/api';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { Button } from '~/modules/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '~/modules/ui/input-group';

type SlugFieldProps<TFieldValues extends FieldValues> = Omit<BaseFormFieldProps<TFieldValues>, 'name'> & {
  nameValue?: string;
  description?: string;
  previousSlug?: string;
  entityType: EntityType;
};

export const SlugFormField = <TFieldValues extends FieldValues>({
  control,
  label,
  previousSlug,
  description,
  nameValue,
  entityType,
}: SlugFieldProps<TFieldValues>) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const name = 'slug';

  const [isDeviating, setDeviating] = useState(false);
  const [isSlugAvailable, setSlugAvailable] = useState<'available' | 'blank' | 'notAvailable'>('blank');

  const prefix = `${appConfig.frontendUrl.replace(/^https?:\/\//, '')}/${entityType === 'organization' ? '' : `${entityType}s/`}`;

  const inputClassName = `${isSlugAvailable !== 'blank' && 'ring-2 sm:focus-visible:ring-2'}
                          ${isSlugAvailable === 'available' && 'ring-green-500 focus-visible:ring-green-500'}
                          ${isSlugAvailable === 'notAvailable' && 'ring-red-500 focus-visible:ring-red-500'}`;

  const form = useFormContext<{ slug: string }>();

  // Watch to check if slug availability
  const slug = useWatch({ control: form.control, name: name });

  // Check if slug is available
  const { mutate: checkAvailability } = useMutation<CheckSlugResponse, ApiError, NonNullable<CheckSlugData['body']>>({
    mutationKey: [name],
    mutationFn: async (body) => {
      return await checkSlug({ body });
    },
    onSuccess: () => {
      if (!isValidSlug(slug)) return;
      form.clearErrors(name);
      setSlugAvailable('available');
    },
    onError: () => {
      form.setError(name, { type: 'manual', message: t('error:slug_exists') });
      setSlugAvailable('notAvailable');
    },
  });

  // Only show green ring if slug is valid
  const isValidSlug = (value: string) => {
    if (!value || value.trim().length < 2) return false;
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
  };

  // Check on change
  useEffect(() => {
    if (slug.length < 2 || (isValidSlug(slug) && previousSlug && previousSlug === slug)) return setSlugAvailable('blank');
    if (isValidSlug(slug)) {
      if (!isOnline) return;

      return checkAvailability({ slug, entityType });
    }
    if (!isValidSlug(slug)) return setSlugAvailable('notAvailable');
  }, [slug]);

  // In create forms, auto-generate slug from name
  useEffect(() => {
    if (previousSlug || isDeviating) return;
    form.setValue(name, slugify(nameValue || '', { lower: true, strict: true }));
  }, [nameValue]);

  // Revert to previous slug
  const revertSlug = () => {
    form.resetField(name);
  };

  return (
    <FormField
      control={control}
      name={name as Path<TFieldValues>}
      render={({ field: { value: formFieldValue, ...rest } }) => (
        <FormItem name={name}>
          <FormLabel>
            {label}
            <span className="ml-1 opacity-50">*</span>
          </FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <InputGroup className={inputClassName}>
              <InputGroupInput
                className="focus-visible:ring-offset-0"
                type={entityType}
                onFocus={() => setDeviating(true)}
                value={formFieldValue || ''}
                {...rest}
              />
              <InputGroupAddon>
                <InputGroupText id="slug-prefix" className="text-xs" style={{ opacity: formFieldValue ? 1 : 0.5 }}>
                  {prefix}
                </InputGroupText>
              </InputGroupAddon>

              {previousSlug && previousSlug !== slug && (
                <InputGroupAddon align="inline-end">
                  <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
                    <UndoIcon size={16} /> <span className="max-sm:hidden ml-1">{t('common:revert')}</span>
                  </Button>
                </InputGroupAddon>
              )}
            </InputGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
