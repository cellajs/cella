import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';

/**
 * A set of layered sections of content—known as tab panels—that are displayed
 * one at a time.
 */
const meta = {
  title: 'ui/Tabs',
  component: Tabs,
  subcomponents: { TabsList, TabsTrigger, TabsContent },
  tags: ['autodocs'],
  argTypes: {},
  args: {
    defaultValue: 'account',
  },
  render: (args) => (
    <div className="w-96">
      <Tabs {...args}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Make changes to your account here.</TabsContent>
        <TabsContent value="password">Change your password here.</TabsContent>
      </Tabs>
    </div>
  ),
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the tabs list.
 */
export const Default: Story = {};

/**
 * The underline form of the tabs list.
 */
export const Underline: Story = {
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList variant="underline">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">Make changes to your account here.</TabsContent>
      <TabsContent value="password">Change your password here.</TabsContent>
    </Tabs>
  ),
};

/**
 * The side form of the tabs list.
 */
export const Side: Story = {
  render: (args) => (
    <Tabs {...args} className="w-96 flex flex-row">
      <TabsList variant="side">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">Make changes to your account here.</TabsContent>
      <TabsContent value="password">Change your password here.</TabsContent>
    </Tabs>
  ),
};

export const ShouldChangeTabs: Story = {
  name: 'when clicking a tab, should change the content',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    const tabs = await canvas.findAllByRole('tab');

    for (let i = 0; i < tabs.length; i++) {
      await step(`click the '${tabs[i].innerText}' tab`, async () => {
        await userEvent.click(tabs[i]);
        await waitFor(() => expect(tabs[i]).toHaveAttribute('aria-selected', 'true'));
        await expect(await canvas.queryByRole('tabpanel', { name: tabs[i].innerText })).toBeVisible();
      });

      await step('check other tabs are not selected', async () => {
        for (let j = 0; j < tabs.length; j++) {
          if (j !== i) {
            expect(tabs[j]).toHaveAttribute('aria-selected', 'false');
            expect(await canvas.queryByRole('tabpanel', { name: tabs[j].innerText })).toBeNull();
          }
        }
      });
    }
  },
};
