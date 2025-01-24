import { Section } from 'jsx-email';

export const EmailBody = ({ children }: { children: React.ReactNode }) => (
  <Section
    style={{
      margin: '0 auto 40px',
      maxWidth: '600px',
      width: '100%',
      fontSize: '1rem',
      color: '#404040',
    }}
  >
    <div style={{ color: '#404040', borderRadius: '.75rem', borderStyle: 'solid', borderColor: '#eaeaea', padding: '1.5rem' }}>{children}</div>
  </Section>
);

// Template export
export const Template = EmailBody;
