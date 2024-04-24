import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form'; //useWatch
import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { dialog } from '../common/dialoger/state';
import InputFormField from '../common/form-fields/input';
import { useNavigate } from '@tanstack/react-router';
import { Form, FormLabel } from '../ui/form';
import { createWorkspace } from '~/api/workspaces';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import { cn } from '~/lib/utils.ts';
import type { UniqueIdentifier } from '@dnd-kit/core';

export interface Story {
  id: UniqueIdentifier;
  name: string;
  type: 'feature' | 'bug' | 'chore';
  points: 0 | 1 | 2 | 3;
}

interface CreateStoryFormProps {
  callback?: (story: Story) => void;
  dialog?: boolean;
}

const formSchema = z.object({ id: z.string(), name: z.string(), type: z.string(), points: z.number() });

type FormValues = z.infer<typeof formSchema>;

const StoryTypeChoose = ({ className = '', defaultValue = 'feature' }: { className?: string; defaultValue?: string }) => {
  const [selectedValue, setSelectedValue] = useState<string>(defaultValue);

  const handleValueChange = (value: string) => {
    setSelectedValue(value);
  };
  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0', className)} value={selectedValue} onValueChange={handleValueChange}>
      <ToggleGroupItem size={'xs'} value="feature">
        <Star size={16} className="fill-amber-400 text-amber-500 group-hover:opacity-0 transition-opacity" />
      </ToggleGroupItem>
      <ToggleGroupItem size={'xs'} value="bug">
        <Bug size={16} className="fill-red-500 text-red-600 group-hover:opacity-0 transition-opacity" />
      </ToggleGroupItem>
      <ToggleGroupItem size={'xs'} value="chore">
        <Bolt size={16} className="fill-slate-500 text-slate-600 group-hover:opacity-0 transition-opacity" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

const CreateStoryForm: React.FC<CreateStoryFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: 'gfdgdfgsf43t54',
        name: '',
        type: 'feature',
        points: 0,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-story', formOptions);
  // Watch to update slug field
  // const name = useWatch({ control: form.control, name: 'name' });

  const { isPending } = useMutation({
    // mutate: create
    mutationFn: createWorkspace, // change to create story
    onSuccess: (result) => {
      form.reset();
      //   callback?.(result);
      toast.success(t('common:success.create_story'));

      setSheet(null);
      navigate({
        to: '/workspace/$idOrSlug/projects',
        params: { idOrSlug: result.slug },
      });

      if (isDialog) dialog.remove();
    },
  });

  const onSubmit = (values: FormValues) => {
    callback?.(values as Story);
    // create(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-4">
        <div className="flex items-center gap-3">
          <FormLabel>Story type</FormLabel>
          <StoryTypeChoose className="h-2" />
        </div>
        <div className="flex items-center gap-3">
          <FormLabel>Story points</FormLabel>
          <SelectImpact mode="edit" />
        </div>
        <InputFormField control={form.control} name="name" label={t('common:name')} required />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button size={'xs'} type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button
            size={'xs'}
            type="reset"
            variant="secondary"
            aria-label="Cancel"
            onClick={() => {
              callback?.({} as Story);
              form.reset();
            }}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateStoryForm;
