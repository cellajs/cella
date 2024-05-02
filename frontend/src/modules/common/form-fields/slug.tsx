import { useMutation } from '@tanstack/react-query';
import type { Control } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';
import { checkSlugAvailable } from '~/api/general';
import InputFormField from './input';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Undo } from 'lucide-react';
import slugify from 'slugify';
import type { PageResourceType } from 'backend/types/common';
import { useElectric } from '../root/electric';

interface SlugFieldProps {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  label: string;
  nameValue?: string;
  description?: string;
  previousSlug?: string;
  type: PageResourceType;
}

export const SlugFormField = ({ control, label, previousSlug, description, nameValue, type }: SlugFieldProps) => {
  const form = useFormContext<{
    slug: string;
  }>();
  const { t } = useTranslation();
  const [isDeviating, setDeviating] = useState(false);
  const [isSlugAvailable, setSlugAvailable] = useState(false);

  // Watch to check if slug availability
  const slug = useWatch({ control: form.control, name: 'slug' });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  // Check if slug is available
  const { mutate: checkAvailability } = useMutation({
    mutationFn: async (params: {
      slug: string;
      type: PageResourceType;
    }) => {
      if (params.type === 'PROJECT') {
        const project = await db.projects.findFirst({
          where: {
            slug: {
              contains: slug,
            },
          },
        });
        return !project;
      }

      return checkSlugAvailable(params);
    },
    onSuccess: (isAvailable) => {
      if (isValidSlug(slug)) form.clearErrors('slug');
      if (previousSlug && slug === previousSlug) return setSlugAvailable(false);
      if (isAvailable) return setSlugAvailable(true);

      // Slug is not available
      form.setError('slug', {
        type: 'manual',
        message: t('common:error.slug_exists'),
      });
      setSlugAvailable(false);
    },
  });

  // Only show green ring if slug is valid
  const isValidSlug = (value: string) => {
    if (!value || value.trim().length < 2) return false;
    const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return regex.test(value) && !value.startsWith('-') && !value.endsWith('-') && value.replaceAll(' ', '') !== '';
  };

  // Check on change
  useEffect(() => {
    if (isValidSlug(slug)) checkAvailability({ slug, type });
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
      name="slug"
      inputClassName={isSlugAvailable && isValidSlug(slug) ? 'ring-2 ring-green-500 focus-visible:ring-2 focus-visible:ring-green-500' : ''}
      onFocus={() => setDeviating(true)}
      label={label}
      prefix={type.toLowerCase()}
      description={description}
      required
      subComponent={
        previousSlug &&
        previousSlug !== slug && (
          <div className="absolute inset-y-1 right-1 flex justify-end">
            <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
              <Undo size={16} className="mr-2" /> {t('common:revert_to')} <strong className="ml-1">{previousSlug}</strong>
            </Button>
          </div>
        )
      }
    />
  );
};
