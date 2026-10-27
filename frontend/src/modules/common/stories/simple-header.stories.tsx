import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TKey } from '~/lib/i18n-locales';
import { SimpleHeader } from '~/modules/common/simple-header';

const meta = { title: 'common/SimpleHeader', component: SimpleHeader, tags: ['autodocs'], parameters: { layout: 'padded' } } satisfies Meta<
  typeof SimpleHeader
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { heading: 'Page title' as TKey, text: 'This is a description of the page content.' as TKey } };

export const HeadingOnly: Story = { args: { heading: 'Settings' as TKey } };

export const WithChildren: Story = {
  args: {
    heading: 'Members' as TKey,
    text: 'Manage your organization members.' as TKey,
    children: <span className="text-muted-foreground text-xs">12 members</span>,
  },
};
