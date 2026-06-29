import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileIcon, InboxIcon, SearchIcon } from 'lucide-react';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';

const meta = {
  title: 'common/ContentPlaceholder',
  component: ContentPlaceholder,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ContentPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'c:no_results' as TKey,
    icon: InboxIcon,
  },
};

export const SearchEmpty: Story = {
  args: {
    title: 'c:no_results' as TKey,
    icon: SearchIcon,
  },
};

export const WithChildren: Story = {
  args: {
    title: 'c:no_results' as TKey,
    icon: FileIcon,
    children: <Button variant="outline">Create new</Button>,
  },
};

export const NoIcon: Story = {
  args: {
    title: 'c:no_results' as TKey,
  },
};
