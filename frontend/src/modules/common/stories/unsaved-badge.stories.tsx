import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';

const meta = {
  title: 'common/UnsavedBadge',
  component: UnsavedBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof UnsavedBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Settings' },
  decorators: [
    (Story) => (
      <div className="unsaved-changes">
        <Story />
      </div>
    ),
  ],
};

export const WithReactNodeTitle: Story = {
  args: { title: <strong>Profile</strong> },
  decorators: [
    (Story) => (
      <div className="unsaved-changes">
        <Story />
      </div>
    ),
  ],
};

export const Hidden: Story = {
  name: 'Without unsaved-changes context',
  args: { title: 'Settings' },
};
