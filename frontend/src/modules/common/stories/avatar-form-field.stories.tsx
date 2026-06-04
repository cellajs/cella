import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormProvider, useForm } from 'react-hook-form';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';

type AvatarStoryValues = {
  thumbnailUrl: string | null;
};

type AvatarStoryProps = {
  label: string;
  type: 'user' | 'organization';
  entity: {
    id?: string;
    name?: string | null;
  };
  defaultUrl?: string | null;
};

function AvatarFormFieldStory({ label, type, entity, defaultUrl = null }: AvatarStoryProps) {
  const form = useForm<AvatarStoryValues>({
    defaultValues: {
      thumbnailUrl: defaultUrl,
    },
  });

  return (
    <FormProvider {...form}>
      <div className="w-96">
        <AvatarFormField form={form} label={label} type={type} name="thumbnailUrl" entity={entity} />
      </div>
    </FormProvider>
  );
}

const meta = {
  title: 'common/AvatarFormField',
  component: AvatarFormField,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AvatarFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UserEmpty: Story = {
  args: {
    form: undefined as never,
    name: 'thumbnailUrl',
    label: 'Profile picture',
    type: 'user',
    entity: { id: 'user-1', name: 'Ada Lovelace' },
  },
  render: function Render() {
    return <AvatarFormFieldStory label="Profile picture" type="user" entity={{ id: 'user-1', name: 'Ada Lovelace' }} />;
  },
};

export const UserWithImage: Story = {
  args: {
    form: undefined as never,
    name: 'thumbnailUrl',
    label: 'Profile picture',
    type: 'user',
    entity: { id: 'user-2', name: 'Grace Hopper' },
  },
  render: function Render() {
    return (
      <AvatarFormFieldStory
        label="Profile picture"
        type="user"
        entity={{ id: 'user-2', name: 'Grace Hopper' }}
        defaultUrl="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80"
      />
    );
  },
};

export const OrganizationEmpty: Story = {
  args: {
    form: undefined as never,
    name: 'thumbnailUrl',
    label: 'Organization logo',
    type: 'organization',
    entity: { id: 'org-1', name: 'Raak Labs' },
  },
  render: function Render() {
    return (
      <AvatarFormFieldStory label="Organization logo" type="organization" entity={{ id: 'org-1', name: 'Raak Labs' }} />
    );
  },
};

export const OrganizationWithImage: Story = {
  args: {
    form: undefined as never,
    name: 'thumbnailUrl',
    label: 'Organization logo',
    type: 'organization',
    entity: { id: 'org-2', name: 'Northwind' },
  },
  render: function Render() {
    return (
      <AvatarFormFieldStory
        label="Organization logo"
        type="organization"
        entity={{ id: 'org-2', name: 'Northwind' }}
        defaultUrl="https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=200&q=80"
      />
    );
  },
};
