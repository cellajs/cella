import type { Meta, StoryObj } from '@storybook/react-vite';
import { BuildingIcon, ShieldCheckIcon, UserIcon } from 'lucide-react';
import { EntityAvatar } from '~/modules/common/entity-avatar';

const meta = { title: 'common/EntityAvatar', component: EntityAvatar, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof EntityAvatar
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFallback: Story = { args: { id: '1', name: 'Alice', type: 'user' } };

export const WithImage: Story = { args: { id: '1', name: 'Alice', url: 'https://i.pravatar.cc/150?u=alice', type: 'user' } };

export const WithIcon: Story = { args: { icon: ShieldCheckIcon } };

export const Organization: Story = { args: { id: '2', name: 'Acme Corp', type: 'organization' } };

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

/** Letters scale with the avatar; up to size-6 only the first initial shows. The bordered size-7 is the main nav avatar. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {['Flip van Haaren', 'Mia Wu', 'Shareworks'].map((name, index) => (
        <div key={name} className="flex items-center gap-4">
          {sizes.map((size) => (
            <EntityAvatar key={size} id={String(index)} name={name} type="user" className={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const DifferentInitials: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar id="1" name="Alice Smith" type="user" />
      <EntityAvatar id="2" name="Flip van Haaren" type="user" />
      <EntityAvatar id="3" name="Mia Wu" type="user" />
      <EntityAvatar id="10" name="Charlie" type="user" />
      <EntityAvatar id="20" name="Acme (NL)" type="organization" />
      <EntityAvatar id="30" name="" type="user" />
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
