import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextEffect } from '~/modules/common/text-effect';

const meta = {
  title: 'common/TextEffect',
  component: TextEffect,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TextEffect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { text: 'Hello, World!' },
};

export const LongText: Story = {
  args: { text: 'The quick brown fox jumps over the lazy dog.' },
};

export const Styled: Story = {
  args: {
    text: 'Animated text reveal',
    className: 'text-2xl font-bold',
  },
};
