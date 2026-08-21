import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';

const ALERT_VARIANTS = ['default', 'brand', 'destructive', 'success', 'warning', 'plain', 'secondary'] as const;

/**
 * Displays a callout for user attention.
 */
const meta = {
  title: 'ui/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      options: ALERT_VARIANTS,
      control: { type: 'radio' },
    },
    soft: {
      control: { type: 'boolean' },
    },
  },
  args: {
    variant: 'default',
  },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the cli.</AlertDescription>
    </Alert>
  ),
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;
/**
 * The default form of the alert.
 */
export const Default: Story = {};

/**
 * Use the `destructive` alert to indicate a destructive action.
 */
export const Destructive: Story = {
  render: (args) => (
    <Alert {...args}>
      <CircleAlertIcon className="size-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  ),
  args: {
    variant: 'destructive',
  },
};

/** Every variant in soft and solid fill; a row whose text washes out means a solid `text-*-foreground` leaked into the soft form. */
export const VariantMatrix: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {([true, false] as const).map((soft) => (
        <div key={String(soft)} className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase">{soft ? 'soft' : 'solid'}</p>
          {ALERT_VARIANTS.map((variant) => (
            <Alert key={variant} variant={variant} soft={soft}>
              <CircleAlertIcon />
              <AlertTitle>{variant}</AlertTitle>
              <AlertDescription>The quick brown fox jumps over the lazy dog.</AlertDescription>
            </Alert>
          ))}
        </div>
      ))}
    </div>
  ),
};
