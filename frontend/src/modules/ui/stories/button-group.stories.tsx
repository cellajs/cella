import type { Meta, StoryObj } from '@storybook/react-vite';
import { DownloadIcon, PlusIcon, SearchIcon, UploadIcon } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '~/modules/ui/button-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

/**
 * Groups related buttons together with proper spacing and visual connection.
 */
const meta = {
  title: 'ui/ButtonGroup',
  component: ButtonGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
  args: {
    orientation: 'horizontal',
  },
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default horizontal button group with multiple buttons.
 */
export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Button 1</Button>
      <Button variant="outline">Button 2</Button>
      <Button variant="outline">Button 3</Button>
    </ButtonGroup>
  ),
};

/**
 * Vertical button group for stacked actions.
 */
export const Vertical: Story = {
  render: () => (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Top</Button>
      <Button variant="outline">Middle</Button>
      <Button variant="outline">Bottom</Button>
    </ButtonGroup>
  ),
};

/**
 * Button group with different button variants.
 */
export const MixedVariants: Story = {
  render: () => (
    <ButtonGroup>
      <Button>Primary</Button>
      <Button variant="outline">Secondary</Button>
      <Button variant="ghost">Tertiary</Button>
    </ButtonGroup>
  ),
};

/**
 * Button group with icons for enhanced visual communication.
 */
export const WithIcons: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">
        <SearchIcon className="mr-2 h-4 w-4" />
        Search
      </Button>
      <Button variant="outline">
        <DownloadIcon className="mr-2 h-4 w-4" />
        Download
      </Button>
      <Button variant="outline">
        <UploadIcon className="mr-2 h-4 w-4" />
        Upload
      </Button>
    </ButtonGroup>
  ),
};

/**
 * Button group with text sections and separators.
 */
export const WithTextAndSeparators: Story = {
  render: () => (
    <div className="space-y-4">
      <ButtonGroup>
        <Button variant="outline">File</Button>
        <Button variant="outline">Edit</Button>
        <ButtonGroupSeparator />
        <Button variant="outline">View</Button>
        <Button variant="outline">Help</Button>
      </ButtonGroup>

      <ButtonGroup>
        <Button variant="outline">Action 1</Button>
        <Button variant="outline">Action 2</Button>
        <ButtonGroupText>Group Label</ButtonGroupText>
        <Button variant="outline">Action 3</Button>
        <Button variant="outline">Action 4</Button>
      </ButtonGroup>
    </div>
  ),
};

/**
 * Button group with select dropdown integration.
 */
export const WithSelect: Story = {
  render: () => (
    <ButtonGroup>
      <Select>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Choose option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
          <SelectItem value="option3">Option 3</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline">
        <PlusIcon className="h-4 w-4" />
      </Button>
    </ButtonGroup>
  ),
};

/**
 * Button group with disabled states.
 */
export const DisabledStates: Story = {
  render: () => (
    <div className="space-y-4">
      <ButtonGroup>
        <Button>Enabled</Button>
        <Button disabled>Disabled</Button>
        <Button variant="outline">Enabled</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </ButtonGroup>

      <ButtonGroup orientation="vertical">
        <Button>Enabled</Button>
        <Button disabled>Disabled</Button>
        <Button variant="ghost">Enabled</Button>
        <Button variant="ghost" disabled>
          Disabled
        </Button>
      </ButtonGroup>
    </div>
  ),
};

/**
 * Button group with different sizes.
 */
export const DifferentSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <ButtonGroup>
        <Button size="sm">Small</Button>
        <Button size="sm">Small</Button>
        <Button size="sm">Small</Button>
      </ButtonGroup>

      <ButtonGroup>
        <Button size="default">Default</Button>
        <Button size="default">Default</Button>
        <Button size="default">Default</Button>
      </ButtonGroup>

      <ButtonGroup>
        <Button size="lg">Large</Button>
        <Button size="lg">Large</Button>
        <Button size="lg">Large</Button>
      </ButtonGroup>
    </div>
  ),
};

/**
 * Complex button group with multiple sections and separators.
 */
export const Complex: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">New</Button>
      <Button variant="outline">Open</Button>
      <ButtonGroupSeparator />
      <ButtonGroupText>File Actions</ButtonGroupText>
      <Button variant="outline">Save</Button>
      <Button variant="outline">Save As</Button>
      <ButtonGroupSeparator />
      <Button variant="destructive">Delete</Button>
    </ButtonGroup>
  ),
};
