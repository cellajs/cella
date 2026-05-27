import type { Meta, StoryObj } from '@storybook/react-vite';
import { HelpText } from '~/modules/common/help-text';

const meta = {
  title: 'common/HelpText',
  component: HelpText,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HelpText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsible: Story = {
  args: {
    children: <span className="font-medium text-sm">What is this setting?</span>,
    content: 'This setting controls the visibility of your profile to other users in the organization.',
  },
};

export const Popover: Story = {
  args: {
    type: 'popover',
    children: <span className="font-medium text-sm">Privacy settings</span>,
    content: 'Configure who can see your profile and activity.',
  },
};
