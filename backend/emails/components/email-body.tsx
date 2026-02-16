import { Section } from 'jsx-email';
import type { JSX } from 'react';

/**
 * Email body component to wrap content with consistent padding and styling.
 */
export const EmailBody = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <Section
    style={{
      margin: '0 auto 40px',
      maxWidth: '600px',
      width: '100%',
      fontSize: '1rem',
      color: '#404040',
    }}
  >
    <div
      style={{
        color: '#404040',
        borderRadius: '.75rem',
        borderStyle: 'solid',
        borderColor: '#eaeaea',
        padding: '1.5rem',
      }}
    >
      {children}
    </div>
  </Section>
);

// Template export
export const Template = EmailBody;
