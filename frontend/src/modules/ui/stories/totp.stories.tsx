import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '~/modules/ui/totp';

/**
 * One-time password (OTP) input components for secure authentication flows.
 */
const meta: Meta = { title: 'ui/TOTP', component: InputOTP, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Basic OTP input with 6 digits.
 */
export const Default: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with 4 digits for shorter codes.
 */
export const FourDigits: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <InputOTP length={4} value={value} onValueChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with separators for better readability.
 */
export const WithSeparators: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSeparator />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with multiple groups for complex codes.
 */
export const MultipleGroups: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <InputOTP length={8} value={value} onValueChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * Pre-filled OTP input for demonstration.
 */
export const Prefilled: Story = {
  render: function Render() {
    const [value, setValue] = useState('123456');
    return (
      <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * Disabled OTP input.
 */
export const Disabled: Story = {
  render: function Render() {
    const [value, setValue] = useState('123456');
    return (
      <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)} disabled>
        <InputOTPGroup>
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
          <InputOTPSlot />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with custom styling.
 */
export const CustomStyling: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="space-y-4">
        <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)} className="gap-4">
          <InputOTPGroup>
            <InputOTPSlot className="size-12 text-lg" />
            <InputOTPSlot className="size-12 text-lg" />
            <InputOTPSlot className="size-12 text-lg" />
            <InputOTPSlot className="size-12 text-lg" />
            <InputOTPSlot className="size-12 text-lg" />
            <InputOTPSlot className="size-12 text-lg" />
          </InputOTPGroup>
        </InputOTP>
      </div>
    );
  },
};

/**
 * Complete authentication form with OTP input.
 */
export const AuthForm: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
      setIsLoading(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setIsLoading(false);
      alert(`OTP submitted: ${value}`);
    };

    const isComplete = value.length === 6;

    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="font-semibold text-2xl">Verify your identity</h2>
          <p className="text-muted-foreground text-sm">Enter the 6-digit code sent to your device</p>
        </div>

        <div className="space-y-4">
          <InputOTP length={6} value={value} onValueChange={(value) => setValue(value)} className="justify-center">
            <InputOTPGroup>
              <InputOTPSlot />
              <InputOTPSlot />
              <InputOTPSlot />
              <InputOTPSlot />
              <InputOTPSlot />
              <InputOTPSlot />
            </InputOTPGroup>
          </InputOTP>

          <Button onClick={handleSubmit} disabled={!isComplete || isLoading} className="w-full">
            {isLoading ? 'Verifying...' : 'Verify Code'}
          </Button>
        </div>

        <div className="text-center">
          <button className="text-muted-foreground text-sm underline hover:text-foreground">Didn't receive a code? Resend</button>
        </div>
      </div>
    );
  },
};

/**
 * Recovery code input example.
 */
export const RecoveryCodes: Story = {
  render: function Render() {
    const [codes, setCodes] = useState(['', '', '']);

    const handleCodeChange = (index: number, value: string) => {
      const newCodes = [...codes];
      newCodes[index] = value;
      setCodes(newCodes);
    };

    return (
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Enter Recovery Codes</h3>
          <p className="text-muted-foreground text-sm">Enter any 3 of your 8-character recovery codes</p>
        </div>

        <div className="space-y-4">
          {codes.map((code, index) => (
            <div key={index} className="flex items-center space-x-2">
              <span className="w-20 font-medium text-sm">Code {index + 1}:</span>
              <InputOTP length={8} validationType="alphanumeric" value={code} onValueChange={(value) => handleCodeChange(index, value)}>
                <InputOTPGroup>
                  <InputOTPSlot />
                  <InputOTPSlot />
                  <InputOTPSlot />
                  <InputOTPSlot />
                  <InputOTPSeparator />
                  <InputOTPSlot />
                  <InputOTPSlot />
                  <InputOTPSlot />
                  <InputOTPSlot />
                </InputOTPGroup>
              </InputOTP>
            </div>
          ))}
        </div>

        <Button className="w-full">Verify Recovery Codes</Button>
      </div>
    );
  },
};
