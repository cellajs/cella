import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, ChevronUpIcon, HomeIcon, InboxIcon, SearchIcon, SettingsIcon, User2Icon } from 'lucide-react';
import { userEvent } from 'storybook/test';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '~/modules/ui/sidebar';

/**
 * A composable, themeable and customizable sidebar component.
 */
const meta = {
  title: 'ui/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  argTypes: {
    side: {
      options: ['left', 'right'],
      control: { type: 'radio' },
    },
    variant: {
      options: ['sidebar', 'floating', 'inset'],
      control: { type: 'radio' },
    },
    collapsible: {
      options: ['offcanvas', 'icon', 'none'],
      control: { type: 'radio' },
    },
  },
  args: {
    side: 'left',
    variant: 'sidebar',
    collapsible: 'icon',
  },
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
        <section className="m-4">
          <SidebarTrigger />
          <div className="size-full" />
        </section>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof Sidebar>;

// Menu items.
const items = [
  {
    title: 'HomeIcon',
    url: '#',
    icon: HomeIcon,
  },
  {
    title: 'InboxIcon',
    url: '#',
    icon: InboxIcon,
  },
  {
    title: 'CalendarIcon',
    url: '#',
    icon: CalendarIcon,
  },
  {
    title: 'SearchIcon',
    url: '#',
    icon: SearchIcon,
  },
  {
    title: 'SettingsIcon',
    url: '#',
    icon: SettingsIcon,
  },
];

/**
 * A simple sidebar with a group of menu items.
 */
export const Simple: Story = {
  render: (args) => (
    <Sidebar {...args}>
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  ),
};

/**
 * A simple sidebar with a footer menu item.
 */
export const Footer: Story = {
  render: (args) => (
    <Sidebar {...args}>
      <SidebarHeader />
      <SidebarContent />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2Icon /> Username
                  <ChevronUpIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-(--radix-popper-anchor-width)">
                <DropdownMenuItem>
                  <span>Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <span>Billing</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  ),
};

export const ShouldCloseOpen: Story = {
  ...Simple,
  name: 'when clicking the trigger, should close and open the sidebar',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    const sidebarBtn = await canvas.findByRole('button', {
      name: /toggle/i,
    });
    await step('close the sidebar', async () => {
      await userEvent.click(sidebarBtn);
    });

    await step('reopen the sidebar', async () => {
      await userEvent.click(sidebarBtn);
    });
  },
};
