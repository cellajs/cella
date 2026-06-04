import type { Meta, StoryObj } from '@storybook/react-vite';
import { Building, ShieldCheck, User } from 'lucide-react';
import { EntityAvatar } from '~/modules/common/entity-avatar';

const meta = {
  title: 'common/EntityAvatar',
  component: EntityAvatar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof EntityAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFallback: Story = {
  args: { id: '1', name: 'Alice', type: 'user' },
};

export const WithImage: Story = {
  args: {
    id: '1',
    name: 'Alice',
    url: 'https://i.pravatar.cc/150?u=alice',
    type: 'user',
  },
};

export const WithIcon: Story = {
  args: { icon: ShieldCheck },
};

export const Organization: Story = {
  args: { id: '2', name: 'Acme Corp', type: 'organization' },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar id="1" name="Small" type="user" size="sm" />
      <EntityAvatar id="2" name="Default" type="user" />
      <EntityAvatar id="3" name="Large" type="user" size="lg" />
    </div>
  ),
};

export const DifferentInitials: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar id="1" name="Alice" type="user" />
      <EntityAvatar id="2" name="Bob" type="user" />
      <EntityAvatar id="3" name="Charlie" type="user" />
      <EntityAvatar id="10" name="Diana" type="user" />
      <EntityAvatar id="20" name="Eve" type="user" />
    </div>
  ),
};

export const IconVariants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar icon={User} />
      <EntityAvatar icon={Building} />
      <EntityAvatar icon={ShieldCheck} />
    </div>
  ),
};
