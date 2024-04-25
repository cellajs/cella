import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type React from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { dialog } from '../common/dialoger/state';
import { useNavigate } from '@tanstack/react-router';
import { Form } from '../ui/form';
import { createWorkspace } from '~/api/workspaces';
import { SelectImpact } from './select-impact.tsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.tsx';
import { Bolt, Bug, Star } from 'lucide-react';
import { cn } from '~/lib/utils.ts';
import type { UniqueIdentifier } from '@dnd-kit/core';
import MDEditor from '@uiw/react-md-editor';
import { useThemeStore } from '~/store/theme.ts';
import type { Task, User } from '~/mocks/dataGeneration.ts';
import AssignMembers from './assign-members.tsx';

export interface Story {
  id: UniqueIdentifier;
  text: string;
  type: StoryType;
  points: 0 | 1 | 2 | 3;
  status: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  assignedTo: User[];
}

interface CreateStoryFormProps {
  callback?: (story?: Task) => void;
  dialog?: boolean;
}

type StoryType = 'feature' | 'bug' | 'chore';

const formSchema = z.object({ id: z.string(), text: z.string(), type: z.string(), points: z.number() });

type FormValues = z.infer<typeof formSchema>;

const StoryTypeChoose = ({
  passSelectedType,
  className = '',
  defaultValue = 'feature',
}: { passSelectedType: (value: StoryType) => void; className?: string; defaultValue?: StoryType }) => {
  const [selectedValue, setSelectedValue] = useState<StoryType>(defaultValue);

  const handleValueChange = (value: StoryType) => {
    setSelectedValue(value);
    passSelectedType(value);
  };
  return (
    <ToggleGroup type="single" variant="merged" className={cn('gap-0 w-full', className)} value={selectedValue} onValueChange={handleValueChange}>
      <ToggleGroupItem size="sm" value="feature" className="w-full">
        <Star size={16} className={`${selectedValue === 'feature' && 'fill-amber-400 text-amber-500'}`} />
        <span className="ml-2">Feature</span>
      </ToggleGroupItem>
      <ToggleGroupItem size="sm" value="bug" className="w-full">
        <Bug size={16} className={`${selectedValue === 'bug' && 'fill-red-400 text-red-500'}`} />
        <span className="ml-2">Bug</span>
      </ToggleGroupItem>
      <ToggleGroupItem size="sm" value="chore" className="w-full">
        <Bolt size={16} className={`${selectedValue === 'chore' && 'fill-slate-400 text-slate-500'}`} />
        <span className="ml-2">Chore</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

const CreateStoryForm: React.FC<CreateStoryFormProps> = ({ callback, dialog: isDialog }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
  const [text, setText] = useState(' ');
  const { mode } = useThemeStore();

  const [type, setType] = useState<StoryType>('feature');
  const [assignTo, setAssignTo] = useState<User[]>([]);
  const [points, setPoints] = useState<0 | 1 | 2 | 3>(0);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        id: 'gfdgdfgsf43t54',
        text: '',
        type: type,
        points: points,
        assignedTo: assignTo,
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
    const story: Story = {
      id: values.id,
      text: text,
      type: type,
      points: points,
      status: 0,
      assignedTo: assignTo,
    };
    console.log('story:', story);
    callback?.(story as Task);
    // create(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 p-4 border-b shadow-inner">
        <StoryTypeChoose passSelectedType={setType} />
        <MDEditor
          value={text}
          defaultTabEnable={true}
          preview={'edit'}
          onChange={(newValue) => {
            if (typeof newValue === 'string') setText(newValue.trim());
          }}
          hideToolbar={true}
          visibleDragbar={false}
          height={'auto'}
          className="border"
          style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', minHeight: '60px', padding: '4px' }}
        />
        <SelectImpact mode="create" passImpact={setPoints} />
        <AssignMembers mode="create" changeAssignTo={setAssignTo} /> {/*  add members */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button size={'xs'} type="submit" disabled={text.replaceAll(' ', '') === ''} loading={isPending}>
            {t('common:create')}
          </Button>
          <Button
            size={'xs'}
            type="reset"
            variant="secondary"
            aria-label="Cancel"
            onClick={() => {
              callback?.();
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
