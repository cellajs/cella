import { useMutation } from '@tanstack/react-query';
import { appConfig, type EntityType } from 'config';
import { Undo } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FieldValues, type Path, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import slugify from 'slugify';
import { type CheckSlugData, CheckSlugResponse, checkSlug } from '~/api.gen';
import { useMeasure } from '~/hooks/use-measure';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { ApiError } from '~/lib/api';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { Button } from '~/modules/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

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
  const { setFocus } = useFormContext();

  const prefixMeasure = useMeasure<HTMLButtonElement>();
  const revertMeasure = useMeasure<HTMLDivElement>();

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

  const prefixClick = () => {
    setFocus(name);
  };

  const getStyle = () => ({
    paddingLeft: `${prefixMeasure.bounds.width + 14}px`,
    paddingRight: `${revertMeasure.bounds.width + 44}px`,
  });

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
            <div className="relative flex w-full items-center ">
              <button
                ref={prefixMeasure.ref}
                type="button"
                tabIndex={-1}
                id="slug-prefix"
                onClick={prefixClick}
                className="absolute left-3 text-xs"
                style={{ opacity: formFieldValue ? 1 : 0.5 }}
              >
                {prefix}
              </button>

              <Input
                className={inputClassName}
                style={getStyle()}
                type={entityType}
                onFocus={() => setDeviating(true)}
                value={formFieldValue || ''}
                {...rest}
              />
              {previousSlug && previousSlug !== slug && (
                <div ref={revertMeasure.ref} id="slug-revert" className="absolute inset-y-1 right-1 flex justify-end">
                  <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
                    <Undo size={16} /> <span className="max-sm:hidden ml-1">{t('common:revert')}</span>
                  </Button>
                </div>
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
