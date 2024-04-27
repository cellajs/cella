import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { dialog } from '../common/dialoger/state';
import { Form, FormField, FormItem, FormControl, FormMessage } from '../ui/form';
import { createWorkspace } from '~/api/workspaces';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { useThemeStore } from '~/store/theme.ts';
import type { Task, User } from '~/mocks/dataGeneration.ts';
import AssignMembers from './assign-members.tsx';
import SetLabels from './set-labels.tsx';

export interface Story {
  id: string;
  markdown: string;
  type: StoryType;
  impact: 0 | 1 | 2 | 3 | null | undefined;
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
  markdown: z.string(),
  type: z.string(),
  impact: z.number().nullable(),
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
  const { mode } = useThemeStore();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: 'gfdgdfgsf43t54',
        markdown: '',
        type: 'feature',
        impact: null,
        assignedTo: [],
        labels: [],
        status: 1,
      },
    }),
    [],
  );

  // Form with draft in local storage
  const form = useFormWithDraft<FormValues>('create-story', formOptions);

  const { isPending } = useMutation({
    // mutate: create
    mutationFn: createWorkspace, // change to create story
    onSuccess: () => {
      //form.reset();
      //   callback?.(result);
      if (isDialog) dialog.remove();
    },
  });

  const onSubmit = (values: FormValues) => {
    const story: Story = {
      id: values.id,
      markdown: values.markdown,
      type: values.type as StoryType,
      impact: values.impact as 0 | 1 | 2 | 3,
      assignedTo: values.assignedTo as User[],
      labels: values.labels.map((label) => label.name),
      status: 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    };
    form.reset();
    toast.success(t('common:success.create_story'));
    callback?.(story as Task);
    // create(values);
  };
  // Fix types
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 border-b flex gap-2 flex-col shadow-inner">
        <FormField
          control={form.control}
          name="type"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <ToggleGroup
                    type="single"
                    variant="merged"
                    className="gap-0 w-full"
                    value={value}
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

        <FormField
          control={form.control}
          name="markdown"
          render={({ field: { value, onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <MDEditor
                    value={value}
                    defaultTabEnable={true}
                    preview={'edit'}
                    onChange={(newValue) => {
                      if (typeof newValue === 'string') onChange(newValue);
                    }}
                    hideToolbar={true}
                    visibleDragbar={false}
                    height={'auto'}
                    minHeight={40}
                    className="border text-sm"
                    style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', padding: '0.5rem' }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {form.getValues('type') !== 'chore' && (
          <FormField
            control={form.control}
            name="impact"
            render={({ field: { onChange } }) => {
              return (
                <FormItem>
                  <FormControl>
                    <SelectImpact mode="create" changeTaskImpact={onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        <FormField
          control={form.control}
          name="assignedTo"
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <AssignMembers mode="create" changeAssignedTo={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="labels"
          render={({ field: { onChange } }) => {
            return (
              <FormItem>
                <FormControl>
                  <SetLabels mode="create" changeLabels={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

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
