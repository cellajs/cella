import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '~/modules/ui/fields';
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
  component: Field,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    orientation: 'vertical',
  },
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Basic field with vertical orientation and label.
 */
export const Default: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="email">Email Address</FieldLabel>
      <FieldContent>
        <Input id="email" type="email" placeholder="Enter your email" />
      </FieldContent>
    </Field>
  ),
};

/**
 * Field with horizontal orientation for compact layouts.
 */
export const Horizontal: Story = {
  render: () => (
    <Field orientation="horizontal">
      <FieldLabel htmlFor="name">Full Name</FieldLabel>
      <FieldContent>
        <Input id="name" placeholder="Enter your full name" />
      </FieldContent>
    </Field>
  ),
};

/**
 * Field with responsive orientation that switches from vertical to horizontal on medium screens.
 */
export const Responsive: Story = {
  render: () => (
    <Field orientation="responsive">
      <FieldLabel htmlFor="username">Username</FieldLabel>
      <FieldContent>
        <Input id="username" placeholder="Choose a username" />
      </FieldContent>
    </Field>
  ),
};

/**
 * Field with description text to provide additional context.
 */
export const WithDescription: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <FieldContent>
        <Input id="password" type="password" placeholder="Enter a secure password" />
      </FieldContent>
      <FieldDescription>
        Password must be at least 8 characters long and include uppercase, lowercase, and numbers.
      </FieldDescription>
    </Field>
  ),
};

/**
 * Field with error message display.
 */
export const WithError: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="email-error">Email Address</FieldLabel>
      <FieldContent>
        <Input id="email-error" type="email" placeholder="Enter your email" aria-invalid="true" />
      </FieldContent>
      <FieldError>Please enter a valid email address</FieldError>
    </Field>
  ),
};

/**
 * Field with multiple error messages.
 */
export const WithMultipleErrors: Story = {
  render: () => {
    const errors = [
      { message: 'Password is too short' },
      { message: 'Must include uppercase letter' },
      { message: 'Must include a number' },
    ];

    return (
      <Field>
        <FieldLabel htmlFor="password-errors">Password</FieldLabel>
        <FieldContent>
          <Input id="password-errors" type="password" placeholder="Enter password" aria-invalid="true" />
        </FieldContent>
        <FieldError errors={errors} />
      </Field>
    );
  },
};

/**
 * Field with icon in the label for better visual communication.
 */
export const WithIcon: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="account">
        <UserIcon className="size-4" />
        Account Name
      </FieldLabel>
      <FieldContent>
        <Input id="account" placeholder="Enter account name" />
      </FieldContent>
    </Field>
  ),
};

/**
 * FieldGroup for organizing multiple related fields.
 */
export const FieldGroupExample: Story = {
  render: () => (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="first-name">First Name</FieldLabel>
        <FieldContent>
          <Input id="first-name" placeholder="Enter first name" />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="last-name">Last Name</FieldLabel>
        <FieldContent>
          <Input id="last-name" placeholder="Enter last name" />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
        <FieldContent>
          <Input id="phone" type="tel" placeholder="Enter phone number" />
        </FieldContent>
      </Field>
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
        <Field>
          <FieldLabel htmlFor="email-fieldset">Email</FieldLabel>
          <FieldContent>
            <Input id="email-fieldset" type="email" placeholder="your@email.com" />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="phone-fieldset">Phone</FieldLabel>
          <FieldContent>
            <Input id="phone-fieldset" type="tel" placeholder="+1 (555) 123-4567" />
          </FieldContent>
        </Field>
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
      <Field>
        <FieldLabel htmlFor="address1">Address Line 1</FieldLabel>
        <FieldContent>
          <Input id="address1" placeholder="Street address" />
        </FieldContent>
      </Field>
      <FieldSeparator />
      <Field>
        <FieldLabel htmlFor="address2">Address Line 2</FieldLabel>
        <FieldContent>
          <Input id="address2" placeholder="Apartment, suite, etc. (optional)" />
        </FieldContent>
      </Field>
    </FieldGroup>
  ),
};

/**
 * Field separator with content label.
 */
export const SeparatorWithContent: Story = {
  render: () => (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="shipping">Shipping Address</FieldLabel>
        <FieldContent>
          <Textarea id="shipping" placeholder="Enter shipping address" rows={3} />
        </FieldContent>
      </Field>
      <FieldSeparator>Billing Address</FieldSeparator>
      <Field>
        <FieldLabel htmlFor="billing">Billing Address</FieldLabel>
        <FieldContent>
          <Textarea id="billing" placeholder="Enter billing address" rows={3} />
        </FieldContent>
      </Field>
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
      <Field>
        <div className="flex items-center space-x-2">
          <Checkbox id="newsletter" />
          <Label htmlFor="newsletter">Subscribe to newsletter</Label>
        </div>
      </Field>
      <Field>
        <div className="flex items-center space-x-2">
          <Checkbox id="notifications" />
          <Label htmlFor="notifications">Enable notifications</Label>
        </div>
      </Field>
      <Field>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" />
          <Label htmlFor="marketing">Receive marketing emails</Label>
        </div>
      </Field>
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
      <Field>
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
      </Field>
    </FieldGroup>
  ),
};

/**
 * Complex form example using multiple field components.
 */
export const ComplexForm: Story = {
  render: () => {
    const [selectedPlan, setSelectedPlan] = useState('basic');

    return (
      <div className="w-full max-w-md space-y-6">
        <FieldSet>
          <FieldLegend>Create Account</FieldLegend>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="full-name">Full Name</FieldLabel>
              <FieldContent>
                <Input id="full-name" placeholder="John Doe" />
              </FieldContent>
              <FieldError>This field is required</FieldError>
            </Field>
            <Field orientation="responsive">
              <FieldLabel htmlFor="email-create">Email Address</FieldLabel>
              <FieldContent>
                <Input id="email-create" type="email" placeholder="john@example.com" />
              </FieldContent>
              <FieldDescription>We'll never share your email with anyone else.</FieldDescription>
            </Field>
            <Field orientation="responsive">
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
            </Field>
            <FieldSeparator>Additional Options</FieldSeparator>
            <FieldGroup data-slot="checkbox-group">
              <Field>
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" />
                  <Label htmlFor="terms">I agree to the terms and conditions</Label>
                </div>
              </Field>
              <Field>
                <div className="flex items-center space-x-2">
                  <Checkbox id="privacy" />
                  <Label htmlFor="privacy">I agree to the privacy policy</Label>
                </div>
              </Field>
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
    <Field data-disabled="true">
      <FieldLabel htmlFor="disabled-field">Disabled Field</FieldLabel>
      <FieldContent>
        <Input id="disabled-field" placeholder="This field is disabled" disabled />
      </FieldContent>
      <FieldDescription>This field is currently disabled.</FieldDescription>
    </Field>
  ),
};
