import { zodResolver } from '@hookform/resolvers/zod';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { action } from 'storybook/actions';
import { expect, userEvent } from 'storybook/test';
import * as z from 'zod';

import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

/**
 * Building forms with React Hook Form and Zod.
 */
const meta: Meta<typeof Form> = {
  title: 'ui/Form',
  component: Form,
  tags: ['autodocs'],
  argTypes: {},
  render: (args) => <ProfileForm {...args} />,
} satisfies Meta<typeof Form>;

export default meta;

type Story = StoryObj<typeof meta>;

const formSchema = z.object({
  username: z.string().min(6, {
    message: 'Username must be at least 6 characters.',
  }),
});

function ProfileForm(args: Story['args']) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
    },
  });
  function onSubmit(values: z.infer<typeof formSchema>) {
    action('onSubmit')(values);
  }
  return (
    <Form {...args} {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <input
                  className="border-input bg-background w-full rounded-md border px-3 py-2"
                  placeholder="username"
                  {...field}
                />
              </FormControl>
              <FormDescription>This is your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

/**
 * The default form of the form.
 */
export const Default: Story = {};

export const ShouldSucceedOnSubmit: Story = {
  name: 'when typing a valid username, should not show an error message',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    await step('Type a valid username', async () => {
      await userEvent.type(await canvas.findByRole('textbox', { name: /username/i }), 'mockuser');
    });

    await step('Click the submit button', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: /submit/i }));
      expect(
        await canvas.queryByText(/username must be at least 6 characters/i, {
          exact: true,
        }),
      ).toBeNull();
    });
  },
};

export const ShouldWarnOnSubmit: Story = {
  name: 'when typing a short username, should show an error message',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    await step('Type a short username', async () => {
      await userEvent.type(await canvas.findByRole('textbox', { name: /username/i }), 'fail');
    });

    await step('Click the submit button', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: /submit/i }));
      expect(
        await canvas.queryByText(/username must be at least 6 characters/i, {
          exact: true,
        }),
      ).toBeVisible();
    });
  },
};
