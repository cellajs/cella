import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserMenu } from '~/modules/me/types';
import { MockMenuSheet } from './mock';
import { mockFullMenuWithSubteams, mockMenu, mockOrganizationsAndTeamsMenu } from './mock/data';

const meta: Meta<typeof MockMenuSheet> = {
  title: 'Navigation/MenuSheet',
  component: (props: { initialMenu?: UserMenu }) => <MockMenuSheet {...props} />,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
The MenuSheet component is a complex navigation component that:

- Displays user menu items (organizations, projects, etc.)
- Supports drag and drop reordering
- Includes search functionality
- Manages user preferences (keep open, detailed menu)
- Handles offline access toggle
- Shows archived items management
- Integrates with sheet system for account management

This story includes comprehensive mocking of all dependencies including Zustand stores, 
drag and drop functionality, and translation system.
        `,
      },
    },
  },
  argTypes: {
    initialMenu: {
      control: 'object',
      description: 'Initial menu data to display',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default menu sheet with sample organizations
 */
export const Default: Story = {
  render: (args) => <MockMenuSheet {...args} />,
  args: {
    initialMenu: mockMenu,
  },
};

/**
 * Organizations and Teams - organizations with teams as submenu items
 */
export const OrganizationsAndTeams: Story = {
  render: (args) => <MockMenuSheet {...args} />,
  args: {
    initialMenu: mockOrganizationsAndTeamsMenu,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows organizations with teams as submenu items. Teams are displayed as nested items under their parent organizations.',
      },
    },
  },
};

/**
 * Full example with Organizations, Teams, and Sub-teams
 */
export const FullWithSubteams: Story = {
  render: (args) => <MockMenuSheet {...args} />,
  args: {
    initialMenu: mockFullMenuWithSubteams,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the complete menu structure with organizations, teams, and sub-teams (like Core, Frontend, Backend, UI/UX, etc.). This demonstrates the full hierarchical navigation capabilities.',
      },
    },
  },
};
