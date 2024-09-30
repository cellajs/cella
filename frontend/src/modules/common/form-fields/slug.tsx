import { onlineManager, useMutation } from '@tanstack/react-query';
import type { Entity } from 'backend/types/common';
import { config } from 'config';
import { Undo } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Control } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import slugify from 'slugify';
import { checkSlugAvailable } from '~/api/general';
import InputFormField from '~/modules/common/form-fields/input';
import { Button } from '~/modules/ui/button';

interface SlugFieldProps {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  label: string;
  nameValue?: string;
  description?: string;
  previousSlug?: string;
  type: Entity;
}

export const SlugFormField = ({ control, label, previousSlug, description, nameValue, type }: SlugFieldProps) => {
  const form = useFormContext<{
    slug: string;
  }>();
  const { t } = useTranslation();
  const [isDeviating, setDeviating] = useState(false);
  const [isSlugAvailable, setSlugAvailable] = useState<'available' | 'blank' | 'notAvailable'>('blank');

  // Watch to check if slug availability
  const slug = useWatch({ control: form.control, name: 'slug' });

  // Check if slug is available
  const { mutate: checkAvailability } = useMutation({
    mutationFn: async (params: {
      slug: string;
      type: Entity;
    }) => {
      return checkSlugAvailable(params);
    },
    onSuccess: (isAvailable) => {
      if (isValidSlug(slug)) form.clearErrors('slug');
      if (isAvailable && isValidSlug(slug)) return setSlugAvailable('available');
      // Slug is not available
      form.setError('slug', {
        type: 'manual',
        message: t('common:error.slug_exists'),
      });
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
      if (!onlineManager.isOnline()) return;

      return checkAvailability({ slug, type });
    }
    if (!isValidSlug(slug)) return setSlugAvailable('notAvailable');
  }, [slug]);

  // In create forms, auto-generate slug from name
  useEffect(() => {
    if (previousSlug || isDeviating) return;
    form.setValue('slug', slugify(nameValue || '', { lower: true }));
  }, [nameValue]);

  // Revert to previous slug
  const revertSlug = () => {
    form.resetField('slug');
  };

  return (
    <InputFormField
      control={control}
      name={'slug'}
      inputClassName={`
        ${isSlugAvailable === 'available' ? 'ring-2 focus-visible:ring-2 ring-green-500  focus-visible:ring-green-500' : ''} 
        ${isSlugAvailable === 'notAvailable' ? 'ring-2 focus-visible:ring-2 ring-red-500 focus-visible:ring-red-500' : ''}`}
      onFocus={() => setDeviating(true)}
      label={label}
      prefix={`${config.frontendUrl.replace(/^https?:\/\//, '')}/${type === 'organization' ? '' : `${type}s/`}`}
      description={description}
      required
      subComponent={
        previousSlug &&
        previousSlug !== slug && (
          <div id="slug-subComponent" className="absolute inset-y-1 right-1 flex justify-end">
            <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
              <Undo size={16} /> <span className="max-sm:hidden ml-1">{t('common:revert_to')}</span>
              <strong className="max-sm:hidden ml-1">{previousSlug}</strong>
            </Button>
          </div>
        )
      }
    />
  );
};
