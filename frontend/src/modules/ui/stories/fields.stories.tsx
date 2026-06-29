import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import {
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLayout,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { Textarea } from '~/modules/ui/textarea';

/**
 * A collection of field components for building forms with consistent layout and behavior.
 */
const meta = {
  title: 'ui/Fields',
  component: FieldLayout,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    orientation: 'vertical',
  },
} satisfies Meta<typeof FieldLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Basic field with vertical orientation and label.
 */
export const Default: Story = {
  render: () => (
    <FieldLayout>
      <FieldLabel htmlFor="email">Email Address</FieldLabel>
      <FieldContent>
        <Input id="email" type="email" placeholder="Enter your email" />
      </FieldContent>
    </FieldLayout>
  ),
};

/**
 * Field with horizontal orientation for compact layouts.
 */
export const Horizontal: Story = {
  render: () => (
    <FieldLayout orientation="horizontal">
      <FieldLabel htmlFor="name">Full Name</FieldLabel>
      <FieldContent>
        <Input id="name" placeholder="Enter your full name" />
      </FieldContent>
    </FieldLayout>
  ),
};

/**
 * Field with responsive orientation that switches from vertical to horizontal on medium screens.
 */
export const Responsive: Story = {
  render: () => (
    <FieldLayout orientation="responsive">
      <FieldLabel htmlFor="username">Username</FieldLabel>
      <FieldContent>
        <Input id="username" placeholder="Choose a username" />
      </FieldContent>
    </FieldLayout>
  ),
};

/**
 * Field with description text to provide additional context.
 */
export const WithDescription: Story = {
  render: () => (
    <FieldLayout>
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <FieldContent>
        <Input id="password" type="password" placeholder="Enter a secure password" />
      </FieldContent>
      <FieldDescription>
        Password must be at least 8 characters long and include uppercase, lowercase, and numbers.
      </FieldDescription>
    </FieldLayout>
  ),
};

/**
 * Field with error message display.
 */
export const WithError: Story = {
  render: () => (
    <FieldLayout>
      <FieldLabel htmlFor="email-error">Email Address</FieldLabel>
      <FieldContent>
        <Input id="email-error" type="email" placeholder="Enter your email" aria-invalid="true" />
      </FieldContent>
      <FieldError>Please enter a valid email address</FieldError>
    </FieldLayout>
  ),
};

/**
 * Field with multiple error messages.
 */
export const WithMultipleErrors: Story = {
  render: function Render() {
    const errors = [
      { message: 'Password is too short' },
      { message: 'Must include uppercase letter' },
      { message: 'Must include a number' },
    ];

    return (
      <FieldLayout>
        <FieldLabel htmlFor="password-errors">Password</FieldLabel>
        <FieldContent>
          <Input id="password-errors" type="password" placeholder="Enter password" aria-invalid="true" />
        </FieldContent>
        <FieldError errors={errors} />
      </FieldLayout>
    );
  },
};

/**
 * Field with icon in the label for better visual communication.
 */
export const WithIcon: Story = {
  render: () => (
    <FieldLayout>
      <FieldLabel htmlFor="account">
        <UserIcon className="size-4" />
        Account Name
      </FieldLabel>
      <FieldContent>
        <Input id="account" placeholder="Enter account name" />
      </FieldContent>
    </FieldLayout>
  ),
};

/**
 * FieldGroup for organizing multiple related fields.
 */
export const FieldGroupExample: Story = {
  render: () => (
    <FieldGroup>
      <FieldLayout>
        <FieldLabel htmlFor="first-name">First Name</FieldLabel>
        <FieldContent>
          <Input id="first-name" placeholder="Enter first name" />
        </FieldContent>
      </FieldLayout>
      <FieldLayout>
        <FieldLabel htmlFor="last-name">Last Name</FieldLabel>
        <FieldContent>
          <Input id="last-name" placeholder="Enter last name" />
        </FieldContent>
      </FieldLayout>
      <FieldLayout>
        <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
        <FieldContent>
          <Input id="phone" type="tel" placeholder="Enter phone number" />
        </FieldContent>
      </FieldLayout>
    </FieldGroup>
  ),
};

/**
 * FieldSet with legend for grouping related form controls.
 */
export const FieldSetExample: Story = {
  render: () => (
    <FieldSet>
      <FieldLegend>Contact Information</FieldLegend>
      <FieldGroup>
        <FieldLayout>
          <FieldLabel htmlFor="email-fieldset">Email</FieldLabel>
          <FieldContent>
            <Input id="email-fieldset" type="email" placeholder="your@email.com" />
          </FieldContent>
        </FieldLayout>
        <FieldLayout>
          <FieldLabel htmlFor="phone-fieldset">Phone</FieldLabel>
          <FieldContent>
            <Input id="phone-fieldset" type="tel" placeholder="+1 (555) 123-4567" />
          </FieldContent>
        </FieldLayout>
      </FieldGroup>
    </FieldSet>
  ),
};

/**
 * Field with separator to divide sections.
 */
export const WithSeparator: Story = {
  render: () => (
    <FieldGroup>
      <FieldLayout>
        <FieldLabel htmlFor="address1">Address Line 1</FieldLabel>
        <FieldContent>
          <Input id="address1" placeholder="Street address" />
        </FieldContent>
      </FieldLayout>
      <FieldSeparator />
      <FieldLayout>
        <FieldLabel htmlFor="address2">Address Line 2</FieldLabel>
        <FieldContent>
          <Input id="address2" placeholder="Apartment, suite, etc. (optional)" />
        </FieldContent>
      </FieldLayout>
    </FieldGroup>
  ),
};

/**
 * Field separator with content label.
 */
export const SeparatorWithContent: Story = {
  render: () => (
    <FieldGroup>
      <FieldLayout>
        <FieldLabel htmlFor="shipping">Shipping Address</FieldLabel>
        <FieldContent>
          <Textarea id="shipping" placeholder="Enter shipping address" rows={3} />
        </FieldContent>
      </FieldLayout>
      <FieldSeparator>Billing Address</FieldSeparator>
      <FieldLayout>
        <FieldLabel htmlFor="billing">Billing Address</FieldLabel>
        <FieldContent>
          <Textarea id="billing" placeholder="Enter billing address" rows={3} />
        </FieldContent>
      </FieldLayout>
    </FieldGroup>
  ),
};

/**
 * Field with checkbox group integration.
 */
export const CheckboxGroup: Story = {
  render: () => (
    <FieldGroup data-slot="checkbox-group">
      <FieldTitle>Preferences</FieldTitle>
      <FieldLayout>
        <div className="flex items-center space-x-2">
          <Checkbox id="newsletter" />
          <Label htmlFor="newsletter">Subscribe to newsletter</Label>
        </div>
      </FieldLayout>
      <FieldLayout>
        <div className="flex items-center space-x-2">
          <Checkbox id="notifications" />
          <Label htmlFor="notifications">Enable notifications</Label>
        </div>
      </FieldLayout>
      <FieldLayout>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" />
          <Label htmlFor="marketing">Receive marketing emails</Label>
        </div>
      </FieldLayout>
    </FieldGroup>
  ),
};

/**
 * Field with radio group integration.
 */
export const RadioGroupExample: Story = {
  render: () => (
    <FieldGroup data-slot="radio-group">
      <FieldTitle>Account Type</FieldTitle>
      <FieldLayout>
        <RadioGroup defaultValue="personal">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="personal" id="personal" />
            <Label htmlFor="personal">Personal Account</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="business" id="business" />
            <Label htmlFor="business">Business Account</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="enterprise" id="enterprise" />
            <Label htmlFor="enterprise">Enterprise Account</Label>
          </div>
        </RadioGroup>
      </FieldLayout>
    </FieldGroup>
  ),
};

/**
 * Complex form example using multiple field components.
 */
export const ComplexForm: Story = {
  render: function Render() {
    const [selectedPlan, setSelectedPlan] = useState('basic');

    return (
      <div className="w-full max-w-md space-y-6">
        <FieldSet>
          <FieldLegend>Create Account</FieldLegend>
          <FieldGroup>
            <FieldLayout orientation="responsive">
              <FieldLabel htmlFor="full-name">Full Name</FieldLabel>
              <FieldContent>
                <Input id="full-name" placeholder="John Doe" />
              </FieldContent>
              <FieldError>This field is required</FieldError>
            </FieldLayout>
            <FieldLayout orientation="responsive">
              <FieldLabel htmlFor="email-create">Email Address</FieldLabel>
              <FieldContent>
                <Input id="email-create" type="email" placeholder="john@example.com" />
              </FieldContent>
              <FieldDescription>We'll never share your email with anyone else.</FieldDescription>
            </FieldLayout>
            <FieldLayout orientation="responsive">
              <FieldLabel htmlFor="plan-select">Subscription Plan</FieldLabel>
              <FieldContent>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic Plan - $9/month</SelectItem>
                    <SelectItem value="pro">Pro Plan - $29/month</SelectItem>
                    <SelectItem value="enterprise">Enterprise - $99/month</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </FieldLayout>
            <FieldSeparator>Additional Options</FieldSeparator>
            <FieldGroup data-slot="checkbox-group">
              <FieldLayout>
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" />
                  <Label htmlFor="terms">I agree to the terms and conditions</Label>
                </div>
              </FieldLayout>
              <FieldLayout>
                <div className="flex items-center space-x-2">
                  <Checkbox id="privacy" />
                  <Label htmlFor="privacy">I agree to the privacy policy</Label>
                </div>
              </FieldLayout>
            </FieldGroup>
          </FieldGroup>
        </FieldSet>
        <Button className="w-full">Create Account</Button>
      </div>
    );
  },
};

/**
 * Disabled field example.
 */
export const Disabled: Story = {
  render: () => (
    <FieldLayout data-disabled="true">
      <FieldLabel htmlFor="disabled-field">Disabled Field</FieldLabel>
      <FieldContent>
        <Input id="disabled-field" placeholder="This field is disabled" disabled />
      </FieldContent>
      <FieldDescription>This field is currently disabled.</FieldDescription>
    </FieldLayout>
  ),
};
