import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, CheckIcon, EyeIcon, EyeOffIcon, SearchIcon, UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '~/modules/ui/input-group';

/**
 * Flexible input group components that combine inputs with addons, buttons, and text for enhanced form interactions.
 */
const meta: Meta = {
  title: 'ui/InputGroup',
  component: InputGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Basic input group with leading text.
 */
export const Default: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <UserIcon className="size-4" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Enter username" />
    </InputGroup>
  ),
};

/**
 * Input group with trailing text.
 */
export const TrailingText: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Enter amount" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Input group with both leading and trailing addons.
 */
export const BothSides: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Input group with button addon.
 */
export const WithButton: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>
          <SearchIcon className="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Input group with multiple buttons.
 */
export const MultipleButtons: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupButton variant="outline">
          <UserIcon className="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput placeholder="Enter email" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="outline">
          <CheckIcon className="size-4" />
        </InputGroupButton>
        <InputGroupButton>
          <SearchIcon className="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Input group with block start addon (top).
 */
export const BlockStart: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Recipient Email</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="user@example.com" />
    </InputGroup>
  ),
};

/**
 * Input group with block end addon (bottom).
 */
export const BlockEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Enter your message" />
      <InputGroupAddon align="block-end">
        <InputGroupText>Max 500 characters</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Textarea input group.
 */
export const TextareaGroup: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Comments</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea placeholder="Enter your comments here..." rows={4} />
      <InputGroupAddon align="block-end">
        <InputGroupText>Supports Markdown</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Password input with toggle visibility.
 */
export const PasswordToggle: Story = {
  render: () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <InputGroup>
        <InputGroupInput type={showPassword ? 'text' : 'password'} placeholder="Enter password" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="button" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
};

/**
 * Input group with error state.
 */
export const WithError: Story = {
  render: () => (
    <div className="space-y-2">
      <InputGroup>
        <InputGroupInput placeholder="Enter email" aria-invalid="true" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="destructive">
            <CheckIcon className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-sm text-destructive">Please enter a valid email address</p>
    </div>
  ),
};

/**
 * Input group with different button sizes.
 */
export const ButtonSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <InputGroup>
        <InputGroupInput placeholder="Extra small button" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="xs">
            <SearchIcon className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupInput placeholder="Small button" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm">
            <SearchIcon className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupInput placeholder="Icon button" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-sm">
            <SearchIcon className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};

/**
 * Search input with filters.
 */
export const SearchWithFilters: Story = {
  render: () => (
    <div className="space-y-4">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupButton variant="outline">
            <SearchIcon className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput placeholder="Search users..." />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="outline">Filters</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          Active
        </Button>
        <Button variant="outline" size="sm">
          Admin
        </Button>
        <Button variant="outline" size="sm">
          This Week
        </Button>
      </div>
    </div>
  ),
};

/**
 * URL input group.
 */
export const UrlInput: Story = {
  render: () => (
    <div className="space-y-4">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="your-website" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>.com</InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="your-subdomain" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>.example.org</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};

/**
 * Number input with controls.
 */
export const NumberInput: Story = {
  render: () => {
    const [value, setValue] = useState('0');

    const increment = () => setValue((prev) => String(Number(prev) + 1));
    const decrement = () => setValue((prev) => String(Math.max(0, Number(prev) - 1)));

    return (
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupButton type="button" onClick={decrement}>
            -
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-center"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="button" onClick={increment}>
            +
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
};

/**
 * Date input group.
 */
export const DateInput: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput type="date" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="outline">
          <CalendarIcon className="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Complex form with multiple input groups.
 */
export const ComplexForm: Story = {
  render: () => (
    <div className="w-full max-w-md space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Personal Information</label>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <UserIcon className="size-4" />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="Full name" />
        </InputGroup>

        <InputGroup>
          <InputGroupInput placeholder="Email address" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>@example.com</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Account Details</label>
        <InputGroup>
          <InputGroupAddon align="block-start">
            <InputGroupText>Username</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="Choose a username" />
          <InputGroupAddon align="block-end">
            <InputGroupText>3-20 characters</InputGroupText>
          </InputGroupAddon>
        </InputGroup>

        <InputGroup>
          <InputGroupInput type="password" placeholder="Password" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="outline">
              <EyeIcon className="size-4" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Bio</label>
        <InputGroup>
          <InputGroupAddon align="block-start">
            <InputGroupText>About you</InputGroupText>
          </InputGroupAddon>
          <InputGroupTextarea placeholder="Tell us about yourself..." rows={3} />
        </InputGroup>
      </div>

      <Button className="w-full">Create Account</Button>
    </div>
  ),
};
