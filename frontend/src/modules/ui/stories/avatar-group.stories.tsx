import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupList,
  type AvatarGroupProps,
  AvatarImage,
  AvatarOverflowIndicator,
} from '~/modules/ui/avatar';

type GroupStoryArgs = AvatarGroupProps & { peopleCount: number };

type Person = { src?: string; initials: string };
function makePeople(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    src: [
      'https://github.com/shadcn.png',
      'https://avatars.githubusercontent.com/u/139895814?v=4',
      'https://avatars.githubusercontent.com/u/14101776?v=4',
      'https://avatars.githubusercontent.com/u/10660468?v=4',
      'https://avatars.githubusercontent.com/u/1024025?v=4',
    ][i % 5],
    initials: `P${i + 1}`,
  }));
}

const meta = {
  title: 'ui/Avatar/Group',
  component: AvatarGroup,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    limit: { control: { type: 'number', min: 1 }, description: 'Max avatars to show (overflow gets +N)' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof AvatarGroup>;

export default meta;

type Story = StoryObj<GroupStoryArgs>;

function GroupRender({ limit, className, peopleCount }: GroupStoryArgs) {
  const people = makePeople(peopleCount ?? 5);
  return (
    <AvatarGroup limit={limit} className={className}>
      <AvatarGroupList>
        {people.map((p, i) => (
          <Avatar key={i}>
            <AvatarImage src={p.src} alt={p.initials} />
            <AvatarFallback>{p.initials}</AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroupList>
      <AvatarOverflowIndicator className="size-8" />
    </AvatarGroup>
  );
}

export const Default: Story = {
  args: {
    limit: 3,
    peopleCount: 5,
  },
  argTypes: {
    peopleCount: {
      control: { type: 'number', min: 1, max: 20 },
      description: 'How many avatars to render',
    },
  },
  render: (args) => <GroupRender {...args} />,
};

export const WithinLimit: Story = {
  args: { limit: 6, peopleCount: 5 },
  argTypes: { peopleCount: { control: { type: 'number', min: 1, max: 20 } } },
  render: (args) => <GroupRender {...args} />,
};

export const WithOverflow: Story = {
  args: { limit: 3, peopleCount: 7 },
  argTypes: { peopleCount: { control: { type: 'number', min: 1, max: 20 } } },
  render: (args) => <GroupRender {...args} />,
};
