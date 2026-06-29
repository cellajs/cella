import type { Meta, StoryObj } from '@storybook/react-vite';
import { MailIcon, SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { InputFormField } from '~/modules/common/form-fields/input';

type StoryFormValues = {
  title: string;
};

type InputStoryProps = {
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'textarea';
  disabled?: boolean;
  readOnly?: boolean;
  icon?: ReactNode;
  inputClassName?: string;
  defaultValue?: string;
  value?: string;
};

function InputFormFieldStory({
  label,
  description,
  placeholder,
  required,
  type = 'text',
  disabled,
  readOnly,
  icon,
  inputClassName,
  defaultValue = '',
  value,
}: InputStoryProps) {
  const form = useForm<StoryFormValues>({
    defaultValues: {
      title: defaultValue,
    },
  });

  return (
    <FormProvider {...form}>
      <div className="w-96">
        <InputFormField<StoryFormValues>
          control={form.control}
          name="title"
          label={label}
          description={description}
          placeholder={placeholder}
          required={required}
          type={type}
          disabled={disabled}
          readOnly={readOnly}
          icon={icon}
          inputClassName={inputClassName}
          value={value}
        />
      </div>
    </FormProvider>
  );
}

const meta = {
  title: 'common/InputFormField',
  component: InputFormField,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof InputFormField<StoryFormValues>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Title',
  },
  render: function Render() {
    return <InputFormFieldStory label="Title" placeholder="Enter a title" />;
  },
};

export const WithDescription: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Email',
    description: 'Used for notifications and account updates.',
    type: 'email',
  },
  render: function Render() {
    return (
      <InputFormFieldStory
        label="Email"
        description="Used for notifications and account updates."
        placeholder="hello@example.com"
        type="email"
      />
    );
  },
};

export const RequiredWithIcon: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Search',
    required: true,
  },
  render: function Render() {
    return <InputFormFieldStory label="Search" placeholder="Search records" required icon={<SearchIcon size={14} />} />;
  },
};

export const Textarea: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Description',
    type: 'textarea',
  },
  render: function Render() {
    return (
      <InputFormFieldStory
        label="Description"
        description="Summarize the change in a couple of sentences."
        placeholder="Write a short description"
        type="textarea"
        defaultValue="This field uses the textarea variant."
      />
    );
  },
};

export const Disabled: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Project name',
    disabled: true,
    value: 'Raak',
  },
  render: function Render() {
    return <InputFormFieldStory label="Project name" disabled value="Raak" icon={<MailIcon size={14} />} />;
  },
};

export const ReadOnly: Story = {
  args: {
    control: undefined as never,
    name: 'title',
    label: 'Slug',
    readOnly: true,
    value: 'story-input-field',
  },
  render: function Render() {
    return <InputFormFieldStory label="Slug" readOnly value="story-input-field" inputClassName="font-mono" />;
  },
};
