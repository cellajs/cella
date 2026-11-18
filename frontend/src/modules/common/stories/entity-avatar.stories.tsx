import type { Meta, StoryObj } from '@storybook/react-vite';
import { BuildingIcon, ShieldCheckIcon, UserIcon } from 'lucide-react';
import { EntityAvatar } from '~/modules/common/entity-avatar';

const meta = { title: 'common/EntityAvatar', component: EntityAvatar, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof EntityAvatar
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFallback: Story = { args: { entity: { id: '1', name: 'Alice', entityType: 'user' } } };

export const WithImage: Story = {
  args: { entity: { id: '1', name: 'Alice', thumbnailUrl: 'https://i.pravatar.cc/150?u=alice', entityType: 'user' } },
};

export const WithIcon: Story = { args: { icon: ShieldCheckIcon } };

export const Organization: Story = { args: { entity: { id: '2', name: 'Acme Corp', entityType: 'organization' } } };

const sizes = [
  'size-5',
  'size-6',
  'size-7 border-[0.1rem] border-current',
  'size-7',
  'size-8',
  'size-10',
  'size-12',
  'size-16',
  'size-20',
  'size-26',
];

const sizeRows = [
  { name: 'Flip van Haaren', type: 'user' },
  { name: 'Mia Wu', type: 'user' },
  { name: 'Shareworks', type: 'user' },
  { name: 'Acme Corp', type: 'organization' },
] as const;

/** Letters scale with the avatar. A user shows a second initial above size-6, other entities always show one. The bordered size-7 is the main nav avatar. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {sizeRows.map(({ name, type }, index) => (
        <div key={name} className="flex items-center gap-4">
          {sizes.map((size) => (
            <EntityAvatar key={size} entity={{ entityType: type, id: String(index), name }} className={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const DifferentInitials: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar entity={{ entityType: 'user', id: '1', name: 'Alice Smith' }} />
      <EntityAvatar entity={{ entityType: 'user', id: '2', name: 'Flip van Haaren' }} />
      <EntityAvatar entity={{ entityType: 'user', id: '3', name: 'Mia Wu' }} />
      <EntityAvatar entity={{ entityType: 'user', id: '10', name: 'Charlie' }} />
      <EntityAvatar entity={{ entityType: 'organization', id: '20', name: 'Acme (NL)' }} />
      <EntityAvatar entity={{ entityType: 'user', id: '30', name: '' }} />
    </div>
  ),
};

export const IconVariants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar icon={UserIcon} />
      <EntityAvatar icon={BuildingIcon} />
      <EntityAvatar icon={ShieldCheckIcon} />
    </div>
  ),
};
