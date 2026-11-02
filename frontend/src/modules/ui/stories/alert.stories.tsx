import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';

const alertVariantNames = ['default', 'destructive', 'success', 'info', 'warning', 'plain'] as const;

/**
 * Displays a callout for user attention.
 */
const meta = {
  title: 'ui/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: { options: alertVariantNames, control: { type: 'radio' } },
  },
  args: { variant: 'default' },
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
  args: { variant: 'destructive' },
};

/** Every variant. */
export const VariantMatrix: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-full max-w-2xl flex-col gap-2">
      {alertVariantNames.map((variant) => (
        <Alert key={variant} variant={variant}>
          <CircleAlertIcon />
          <AlertTitle>{variant}</AlertTitle>
          <AlertDescription>The quick brown fox jumps over the lazy dog.</AlertDescription>
        </Alert>
      ))}
    </div>
  ),
};
