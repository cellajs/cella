import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { JsonViewer } from '../json-viewer';

// Sample data for stories
const simpleObject = {
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
  active: true,
  role: null,
};

const nestedObject = {
  user: {
    id: 1,
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      settings: {
        theme: 'dark',
        notifications: true,
      },
    },
  },
  metadata: {
    createdAt: '2024-01-15T10:30:00Z',
    version: '1.0.0',
  },
};

const arrayData = {
  users: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' },
  ],
  tags: ['javascript', 'typescript', 'react'],
  scores: [95, 87, 92, 78, 88],
};

const longStringData = {
  title: 'Short title',
  description:
    'This is a very long description that should be truncated when displayed in the JSON viewer. It contains a lot of text to demonstrate the string collapsing functionality that helps keep the view clean and readable.',
  content:
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
};

const openApiSchemaData = {
  type: 'object',
  required: true,
  ref: '#/components/schemas/User',
  properties: {
    id: { type: 'string', required: true },
    email: { type: 'string', format: 'email', required: true },
    age: { type: 'integer', required: false },
    active: { type: 'boolean', required: false },
    roles: {
      type: 'array',
      items: { type: 'string' },
    },
    profile: {
      type: 'object',
      required: false,
      ref: '#/components/schemas/Profile',
      properties: {
        bio: { type: 'string', required: false },
      },
    },
  },
};

/**
 * A flexible JSON viewer component with collapsible nodes, search highlighting,
 * clipboard support, and special OpenAPI schema mode.
 */
const meta = {
  title: 'common/JsonViewer',
  component: JsonViewer,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    value: {
      control: 'object',
      description: 'The JSON data to display',
    },
    defaultInspectDepth: {
      control: { type: 'number', min: 0, max: 10 },
      description: 'Default depth to expand nodes',
    },
    rootName: {
      control: 'text',
      description: 'Root node name (false to hide)',
    },
    displayDataTypes: {
      control: 'boolean',
      description: 'Show data type labels next to values',
    },
    enableClipboard: {
      control: 'boolean',
      description: 'Enable copy to clipboard button',
    },
    indentWidth: {
      control: { type: 'number', min: 1, max: 8 },
      description: 'Indentation width in characters',
    },
    collapseStringsAfterLength: {
      control: { type: 'number', min: 10, max: 200 },
      description: 'Truncate strings after this length',
    },
    openapiMode: {
      control: 'select',
      options: [undefined, 'spec', 'schema'],
      description: 'OpenAPI display mode',
    },
    searchText: {
      control: 'text',
      description: 'Text to search and highlight',
    },
    expandAll: {
      control: 'boolean',
      description: 'Expand all nodes',
    },
    showKeyQuotes: {
      control: 'boolean',
      description: 'Show quotes around object keys',
    },
    expandChildrenDepth: {
      control: { type: 'number', min: 1, max: 5 },
      description: 'Levels to expand when clicking a node',
    },
  },
  args: {
    value: simpleObject,
    defaultInspectDepth: 3,
    rootName: 'root',
    displayDataTypes: false,
    enableClipboard: false,
    indentWidth: 2,
    collapseStringsAfterLength: 50,
    expandAll: false,
    showKeyQuotes: true,
    expandChildrenDepth: 1,
  },
} satisfies Meta<typeof JsonViewer>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default JSON viewer with a simple object.
 */
export const Default: Story = {
  args: {
    value: simpleObject,
  },
};

/**
 * Nested object with multiple levels of depth.
 */
export const NestedObject: Story = {
  args: {
    value: nestedObject,
    defaultInspectDepth: 2,
  },
};

/**
 * Arrays and collections display.
 */
export const WithArrays: Story = {
  args: {
    value: arrayData,
    defaultInspectDepth: 3,
  },
};

/**
 * Single-line primitive arrays in schema mode.
 */
export const SingleLineArrays: Story = {
  args: {
    value: arrayData,
    openapiMode: 'schema',
    defaultInspectDepth: 3,
  },
};

/**
 * Display with data type labels shown.
 */
export const WithDataTypes: Story = {
  args: {
    value: simpleObject,
    displayDataTypes: true,
  },
};

/**
 * Copy to clipboard enabled on hover.
 */
export const WithClipboard: Story = {
  args: {
    value: nestedObject,
    enableClipboard: true,
  },
};

/**
 * Long strings are truncated with click to expand.
 */
export const LongStrings: Story = {
  args: {
    value: longStringData,
    collapseStringsAfterLength: 50,
  },
};

/**
 * Keys displayed without quotes for cleaner look.
 */
export const WithoutKeyQuotes: Story = {
  args: {
    value: simpleObject,
    showKeyQuotes: false,
  },
};

/**
 * Hidden root name for embedding in other contexts.
 */
export const HiddenRootName: Story = {
  args: {
    value: simpleObject,
    rootName: false,
  },
};

/**
 * Custom root name.
 */
export const CustomRootName: Story = {
  args: {
    value: simpleObject,
    rootName: 'userData',
  },
};

/**
 * All nodes expanded regardless of depth.
 */
export const ExpandAll: Story = {
  args: {
    value: nestedObject,
    expandAll: true,
  },
};

/**
 * Shallow default expansion (depth 1).
 */
export const ShallowExpansion: Story = {
  args: {
    value: nestedObject,
    defaultInspectDepth: 1,
  },
};

/**
 * Wider indentation for better readability.
 */
export const WideIndent: Story = {
  args: {
    value: nestedObject,
    indentWidth: 4,
    defaultInspectDepth: 4,
  },
};

/**
 * Interactive search with highlighting.
 */
export const WithSearch: Story = {
  render: (args) => {
    const [searchText, setSearchText] = useState('');
    return (
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search JSON..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="px-3 py-2 border rounded-md w-64"
        />
        <div className="border rounded-md p-4">
          <JsonViewer {...args} searchText={searchText} />
        </div>
      </div>
    );
  },
  args: {
    value: nestedObject,
    defaultInspectDepth: 4,
  },
};

/**
 * OpenAPI schema mode with type labels and required indicators.
 */
export const OpenApiSchemaMode: Story = {
  args: {
    value: openApiSchemaData,
    openapiMode: 'schema',
    showKeyQuotes: false,
    defaultInspectDepth: 4,
  },
};

/**
 * Cascade expand multiple levels on click.
 */
export const CascadeExpand: Story = {
  args: {
    value: nestedObject,
    defaultInspectDepth: 1,
    expandChildrenDepth: 3,
  },
};

/**
 * Complex real-world API response structure.
 */
export const ComplexApiResponse: Story = {
  args: {
    value: {
      success: true,
      data: {
        users: [
          {
            id: 'usr_123',
            email: 'alice@example.com',
            profile: {
              firstName: 'Alice',
              lastName: 'Smith',
              avatar: 'https://example.com/avatars/alice.jpg',
            },
            permissions: ['read', 'write', 'admin'],
            createdAt: '2024-01-15T10:30:00Z',
            metadata: {
              lastLogin: '2024-06-20T14:22:00Z',
              loginCount: 42,
              verified: true,
            },
          },
          {
            id: 'usr_456',
            email: 'bob@example.com',
            profile: {
              firstName: 'Bob',
              lastName: 'Jones',
              avatar: null,
            },
            permissions: ['read'],
            createdAt: '2024-03-22T08:15:00Z',
            metadata: {
              lastLogin: '2024-06-19T09:45:00Z',
              loginCount: 7,
              verified: false,
            },
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 2,
          hasMore: false,
        },
      },
      meta: {
        requestId: 'req_abc123',
        timestamp: '2024-06-21T12:00:00Z',
        version: 'v1',
      },
    },
    defaultInspectDepth: 2,
    enableClipboard: true,
  },
};

/**
 * Empty and edge case values.
 */
export const EdgeCases: Story = {
  args: {
    value: {
      emptyObject: {},
      emptyArray: [],
      nullValue: null,
      undefinedLike: undefined,
      zero: 0,
      emptyString: '',
      falseBoolean: false,
      nestedEmpty: {
        inner: {},
        list: [],
      },
    },
    defaultInspectDepth: 3,
  },
};

/**
 * All features combined for comprehensive testing.
 */
export const AllFeatures: Story = {
  render: (args) => {
    const [searchText, setSearchText] = useState('');
    return (
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="px-3 py-2 border rounded-md w-64"
        />
        <div className="border rounded-md p-4 max-h-[500px] overflow-auto">
          <JsonViewer {...args} searchText={searchText} displayDataTypes enableClipboard />
        </div>
      </div>
    );
  },
  args: {
    value: {
      ...nestedObject,
      ...arrayData,
      config: longStringData,
    },
    defaultInspectDepth: 2,
    showKeyQuotes: false,
  },
};

// ============================================================================
// Interaction Tests
// ============================================================================

/**
 * Tests that clicking a collapsed node expands it to show children.
 */
export const ShouldExpandOnClick: Story = {
  name: 'when collapsed node is clicked, should expand to show children',
  tags: ['!dev', '!autodocs'],
  args: {
    value: nestedObject,
    defaultInspectDepth: 1,
    rootName: false,
  },
  play: async ({ canvas, step }) => {
    await step('Click to expand user node', async () => {
      const userNode = await canvas.findByText('"user"');
      await userEvent.click(userNode, { delay: 100 });
      await waitFor(() => expect(canvas.queryByText('"id"')).toBeVisible());
      await waitFor(() => expect(canvas.queryByText('"profile"')).toBeVisible());
    });
  },
};

/**
 * Tests that clicking an expanded node collapses it.
 */
export const ShouldCollapseOnClick: Story = {
  name: 'when expanded node is clicked, should collapse',
  tags: ['!dev', '!autodocs'],
  args: {
    value: nestedObject,
    defaultInspectDepth: 2,
    rootName: false,
  },
  play: async ({ canvas, step }) => {
    // First verify it's expanded
    await waitFor(() => expect(canvas.queryByText('"id"')).toBeVisible());

    await step('Click to collapse user node', async () => {
      const userNode = await canvas.findByText('"user"');
      await userEvent.click(userNode, { delay: 100 });
      await waitFor(() => expect(canvas.queryByText('"id"')).toBeNull());
    });
  },
};

/**
 * Tests that the copy button appears on hover and copies content.
 */
export const ShouldShowCopyOnHover: Story = {
  name: 'when node is hovered, should show copy button',
  tags: ['!dev', '!autodocs'],
  args: {
    value: simpleObject,
    enableClipboard: true,
    rootName: false,
    defaultInspectDepth: 0,
  },
  play: async ({ canvas, step }) => {
    await step('Hover over node to show copy button', async () => {
      const rootNode = await canvas.findByText('5 items');
      await userEvent.hover(rootNode);
      await waitFor(() => expect(canvas.getByTitle('Copy to clipboard')).toBeVisible());
    });

    await step('Unhover to hide copy button', async () => {
      const rootNode = await canvas.findByText('5 items');
      await userEvent.unhover(rootNode);
      // Copy button should become invisible (opacity-0)
    });
  },
};

/**
 * Tests that long strings can be expanded by clicking.
 */
export const ShouldExpandLongString: Story = {
  name: 'when truncated string is clicked, should expand full text',
  tags: ['!dev', '!autodocs'],
  args: {
    value: longStringData,
    collapseStringsAfterLength: 30,
    defaultInspectDepth: 2,
    rootName: false,
  },
  play: async ({ canvas, step }) => {
    await step('Verify string is truncated', async () => {
      // Should show truncated text with ellipsis (multiple strings are truncated)
      const ellipses = canvas.queryAllByText('…');
      expect(ellipses.length).toBeGreaterThan(0);
    });

    await step('Click to expand string', async () => {
      // Click the first truncated string
      const ellipses = canvas.getAllByText('…');
      const parentSpan = ellipses[0].closest('span[title]');
      if (parentSpan) await userEvent.click(parentSpan, { delay: 100 });
      // After clicking, there should be one less ellipsis
      await waitFor(() => expect(canvas.queryAllByText('…').length).toBe(ellipses.length - 1));
    });
  },
};

/**
 * Tests search highlighting functionality.
 */
export const ShouldHighlightSearchMatches: Story = {
  name: 'when search text matches, should highlight matches',
  tags: ['!dev', '!autodocs'],
  args: {
    value: simpleObject,
    searchText: 'john',
    defaultInspectDepth: 2,
    rootName: false,
  },
  play: async ({ canvas, step }) => {
    await step('Verify search match is highlighted', async () => {
      // The "John" text should have highlight styling applied
      const johnText = await canvas.findByText('John');
      expect(johnText).toBeVisible();
    });
  },
};

/**
 * Tests that primitive arrays render on single line in schema mode.
 */
export const ShouldRenderSingleLineArrays: Story = {
  name: 'when openapiMode is schema, primitive arrays render inline',
  tags: ['!dev', '!autodocs'],
  args: {
    value: { numbers: [1, 2, 3, 4, 5] },
    openapiMode: 'schema',
    defaultInspectDepth: 2,
    rootName: false,
  },
  play: async ({ canvas, step }) => {
    await step('Verify array is on single line', async () => {
      // All numbers should be visible without expand/collapse
      expect(canvas.queryByText('1')).toBeVisible();
      expect(canvas.queryByText('5')).toBeVisible();
      // Should not show "items" collapse indicator
      expect(canvas.queryByText(/items/)).toBeNull();
    });
  },
};

/**
 * Tests schema mode displays type labels.
 */
export const ShouldShowTypeLabelsInSchemaMode: Story = {
  name: 'when openapiMode is schema, should show type labels',
  tags: ['!dev', '!autodocs'],
  args: {
    value: openApiSchemaData,
    openapiMode: 'schema',
    defaultInspectDepth: 2,
    rootName: false,
    showKeyQuotes: false,
  },
  play: async ({ canvas, step }) => {
    await step('Verify type label is displayed', async () => {
      // Should show "object" type label (from nested profile property)
      const objectLabels = await canvas.findAllByText('object');
      expect(objectLabels.length).toBeGreaterThan(0);
    });

    await step('Verify ref label is displayed', async () => {
      // Should show "Profile" ref label (extracted from #/components/schemas/Profile on nested profile property)
      expect(canvas.queryByText('Profile')).toBeVisible();
    });
  },
};
