import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '~/modules/ui/totp';

/**
 * One-time password (OTP) input components for secure authentication flows.
 */
const meta: Meta = {
  title: 'ui/TOTP',
  component: InputOTP,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Basic OTP input with 6 digits.
 */
export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <InputOTP maxLength={6} value={value} onChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with 4 digits for shorter codes.
 */
export const FourDigits: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <InputOTP maxLength={4} value={value} onChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with separators for better readability.
 */
export const WithSeparators: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <InputOTP maxLength={6} value={value} onChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSeparator />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with multiple groups for complex codes.
 */
export const MultipleGroups: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <InputOTP maxLength={8} value={value} onChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
          <InputOTPSlot index={6} />
          <InputOTPSlot index={7} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * Pre-filled OTP input for demonstration.
 */
export const Prefilled: Story = {
  render: () => {
    const [value, setValue] = useState('123456');
    return (
      <InputOTP maxLength={6} value={value} onChange={(value) => setValue(value)}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * Disabled OTP input.
 */
export const Disabled: Story = {
  render: () => {
    const [value, setValue] = useState('123456');
    return (
      <InputOTP maxLength={6} value={value} onChange={(value) => setValue(value)} disabled>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    );
  },
};

/**
 * OTP input with custom styling.
 */
export const CustomStyling: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="space-y-4">
        <InputOTP maxLength={6} value={value} onChange={(value) => setValue(value)} className="gap-4">
          <InputOTPGroup>
            <InputOTPSlot index={0} className="w-12 h-12 text-lg" />
            <InputOTPSlot index={1} className="w-12 h-12 text-lg" />
            <InputOTPSlot index={2} className="w-12 h-12 text-lg" />
            <InputOTPSlot index={3} className="w-12 h-12 text-lg" />
            <InputOTPSlot index={4} className="w-12 h-12 text-lg" />
            <InputOTPSlot index={5} className="w-12 h-12 text-lg" />
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
  render: () => {
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
          <h2 className="text-2xl font-semibold">Verify your identity</h2>
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to your device</p>
        </div>

        <div className="space-y-4">
          <InputOTP
            maxLength={6}
            value={value}
            onChange={(value) => setValue(value)}
            containerClassName="justify-center"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          <Button onClick={handleSubmit} disabled={!isComplete || isLoading} className="w-full">
            {isLoading ? 'Verifying...' : 'Verify Code'}
          </Button>
        </div>

        <div className="text-center">
          <button className="text-sm text-muted-foreground hover:text-foreground underline">
            Didn't receive a code? Resend
          </button>
        </div>
      </div>
    );
  },
};

/**
 * Recovery code input example.
 */
export const RecoveryCodes: Story = {
  render: () => {
    const [codes, setCodes] = useState(['', '', '']);

    const handleCodeChange = (index: number, value: string) => {
      const newCodes = [...codes];
      newCodes[index] = value;
      setCodes(newCodes);
    };

    return (
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Enter Recovery Codes</h3>
          <p className="text-sm text-muted-foreground">Enter any 3 of your 8-character recovery codes</p>
        </div>

        <div className="space-y-4">
          {codes.map((code, index) => (
            <div key={index} className="flex items-center space-x-2">
              <span className="text-sm font-medium w-20">Code {index + 1}:</span>
              <InputOTP maxLength={8} value={code} onChange={(value) => handleCodeChange(index, value)}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSeparator />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                  <InputOTPSlot index={6} />
                  <InputOTPSlot index={7} />
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
