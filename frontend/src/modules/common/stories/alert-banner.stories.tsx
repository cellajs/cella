import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRightIcon, CircleCheckBigIcon, InfoIcon, ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { Button } from '~/modules/ui/button';

const meta = { title: 'common/AlertBanner', component: AlertBanner, tags: ['autodocs'], parameters: { layout: 'padded' } } satisfies Meta<
  typeof AlertBanner
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { id: 'story-default', children: 'This is a default alert banner.' } };

export const WithTitle: Story = {
  args: { id: 'story-title', title: 'Heads up!' as TKey, children: 'Something important happened that you should know about.' },
};

export const WithIcon: Story = {
  args: { id: 'story-icon', icon: InfoIcon, title: 'Information' as TKey, children: 'This alert includes an icon for additional context.' },
};

export const Destructive: Story = {
  args: {
    id: 'story-destructive',
    variant: 'destructive',
    icon: TriangleAlertIcon,
    title: 'Error' as TKey,
    children: 'Something went wrong. Please try again.',
  },
};

export const Success: Story = {
  args: { id: 'story-success', variant: 'success', icon: CircleCheckBigIcon, title: 'Success' as TKey, children: 'Your changes have been saved.' },
};

export const Warning: Story = {
  args: { id: 'story-warning', variant: 'warning', icon: TriangleAlertIcon, title: 'Warning' as TKey, children: 'This action cannot be undone.' },
};

/** The action sits beside the text from `sm` up and wraps under it on a phone; the close button centers on it. */
export const WithAction: Story = {
  args: {
    id: 'story-action',
    variant: 'info',
    icon: ShieldAlertIcon,
    title: 'MFA is off' as TKey,
    children: "Multifactor authentication adds a second step at sign-in, so a leaked password alone can't open your account.",
    action: (
      <Button variant="info" soft size="sm" className="max-sm:w-full">
        Set up MFA
        <ArrowRightIcon />
      </Button>
    ),
  },
};

export const Animated: Story = {
  args: { id: 'story-animated', animate: true, icon: InfoIcon, title: 'Animated alert' as TKey, children: 'This alert uses enter/exit animations.' },
};
