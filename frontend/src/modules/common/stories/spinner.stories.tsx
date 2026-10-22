import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from '~/modules/common/spinner';

const meta = { title: 'common/Spinner', component: Spinner, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoDelay: Story = { args: { noDelay: true } };

export const Small: Story = { args: { size: 'sm' } };

export const Large: Story = { args: { size: 'lg' } };
