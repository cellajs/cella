import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import type { Control, UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { dialog } from '../common/dialoger/state';
import { useNavigate } from '@tanstack/react-router';
import { Form, FormDescription, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { createWorkspace } from '~/api/workspaces';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import { cn } from '~/lib/utils.ts';
import MDEditor from '@uiw/react-md-editor';
import { useThemeStore } from '~/store/theme.ts';
import type { Task, User } from '~/mocks/dataGeneration.ts';
import AssignMembers from './assign-members.tsx';
import SetLabels from './set-labels.tsx';

export interface Story {
  id: string;
  text: string;
  type: StoryType;
  points: 0 | 1 | 2 | 3;
  status: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  assignedTo: User[];
  labels: string[];
}

interface CreateStoryFormProps {
  callback?: (story?: Task) => void;
  dialog?: boolean;
}

type StoryType = 'feature' | 'bug' | 'chore';

const formSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.string(),
  points: z.number(),
  assignedTo: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      thumbnailUrl: z.number().nullable(),
      bio: z.string(),
    }),
  ),
  labels: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      color: z.string(),
    }),
  ),
  status: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

const CreateStoryForm: React.FC<CreateStoryFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
  const { mode } = useThemeStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: 'gfdgdfgsf43t54',
        text: '',
        type: 'feature',
        points: 0,
        assignedTo: [],
        labels: [],
        status: 0,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-story', formOptions);

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
    const story: Story = {
      id: values.id,
      text: values.text,
      type: values.type as StoryType,
      points: values.points as 0 | 1 | 2 | 3,
      assignedTo: values.assignedTo as User[],
      labels: values.labels.map((label) => label.name),
      status: 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    };
    callback?.(story as Task);
    // create(values);
  };
  // Fix types
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 p-4 border-b shadow-inner">
        <StoryTypeChooseForm control={form.control} name={'type'} />
        <StoryTextForm control={form.control} name={'text'} mode={mode} />
        <StoryImpactForm control={form.control} name={'points'} storyType={form.getValues('type') as StoryType} />
        <StoryAssignMembersForm control={form.control} name={'assignedTo'} />
        <StoryAddLabelsForm control={form.control} name={'labels'} />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button size={'xs'} type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button
            size={'xs'}
            type="reset"
            variant="secondary"
            className={form.formState.isDirty ? '' : 'invisible'}
            aria-label="Cancel"
            onClick={() => form.reset()}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateStoryForm;

type Props = {
  control: Control<FormValues>;
  name: 'id' | 'text' | 'type' | 'points' | 'assignedTo' | 'status' | 'labels';
  label?: string;
  placeholder?: string;
  description?: string;
  disabledItemFunction?: (value: string) => boolean;
  emptyIndicator?: string;
  required?: boolean;
};

const StoryTypeChooseForm = ({
  control,
  name,
  label,
  className = '',
  defaultValue = 'feature',
  required,
  description,
}: Props & { defaultValue?: StoryType; className?: string }) => {
  const { t } = useTranslation();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => {
        const defaultFieldValue = value ? value : defaultValue;

        return (
          <FormItem>
            <FormLabel>
              {label && (
                <>
                  {label}
                  {required && <span className="ml-1 opacity-50">*</span>}
                </>
              )}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <ToggleGroup
                type="single"
                variant="merged"
                className={cn('gap-0 w-full', className)}
                value={defaultFieldValue as StoryType}
                onValueChange={(value) => {
                  onChange(value);
                }}
              >
                <ToggleGroupItem size="sm" value="feature" className="w-full">
                  <Star size={16} className={`${value === 'feature' && 'fill-amber-400 text-amber-500'}`} />
                  <span className="ml-2 font-light">{t('common:feature')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem size="sm" value="bug" className="w-full">
                  <Bug size={16} className={`${value === 'bug' && 'fill-red-400 text-red-500'}`} />
                  <span className="ml-2 font-light">{t('common:bug')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem size="sm" value="chore" className="w-full">
                  <Bolt size={16} className={`${value === 'chore' && 'fill-slate-400 text-slate-500'}`} />
                  <span className="ml-2 font-light">{t('common:chore')}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

const StoryTextForm = ({
  control,
  name,
  label,
  defaultValue = ' ',
  required,
  description,
  mode,
}: Props & { defaultValue?: string; mode: 'dark' | 'light' }) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => {
        const defaultInnerValue = value ? value : defaultValue;

        return (
          <FormItem>
            <FormLabel>
              {label && (
                <>
                  {label}
                  {required && <span className="ml-1 opacity-50">*</span>}
                </>
              )}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <MDEditor
                value={defaultInnerValue as string}
                defaultTabEnable={true}
                preview={'edit'}
                onChange={(newValue) => {
                  if (typeof newValue === 'string') onChange(newValue);
                }}
                hideToolbar={true}
                visibleDragbar={false}
                height={'auto'}
                className="border"
                style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', minHeight: '60px', padding: '0.5rem' }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

const StoryImpactForm = ({ control, name, label, required, description, storyType }: Props & { storyType: StoryType }) => {
  return (
    <>
      {storyType !== 'chore' && (
        <FormField
          control={control}
          name={name}
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormLabel>
                  {label && (
                    <>
                      {label}
                      {required && <span className="ml-1 opacity-50">*</span>}
                    </>
                  )}
                </FormLabel>
                {description && <FormDescription>{description}</FormDescription>}
                <FormControl>
                  <SelectImpact mode="create" changeTaskImpact={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      )}
    </>
  );
};

const StoryAssignMembersForm = ({ control, name, label, required, description }: Props) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange } }) => {
        return (
          <FormItem>
            <FormLabel>
              {label && (
                <>
                  {label}
                  {required && <span className="ml-1 opacity-50">*</span>}
                </>
              )}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <AssignMembers mode="create" changeAssignedTo={onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

const StoryAddLabelsForm = ({ control, name, label, required, description }: Props) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange } }) => {
        return (
          <FormItem>
            <FormLabel>
              {label && (
                <>
                  {label}
                  {required && <span className="ml-1 opacity-50">*</span>}
                </>
              )}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <SetLabels mode="create" changeLabels={onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};
