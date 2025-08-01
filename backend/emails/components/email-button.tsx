import { Button, Section } from 'jsx-email';

export const EmailButton = ({ ButtonText, href }: { ButtonText: string; href: string | URL }) => (
  <Section style={{ textAlign: 'center', marginBottom: '2rem', marginTop: '2rem' }}>
    <Button
      align="center"
      height={38}
      width={200}
      style={{
        textAlign: 'center',
        background: '#000',
        color: 'white',
        padding: '0.75rem 1.25rem',
        fontSize: '1rem',
        textDecoration: 'none',
        fontWeight: 'font-semibold',
        borderRadius: '0.25rem',
      }}
      href={href instanceof URL ? href.toString() : href}
    >
      {ButtonText}
    </Button>
  </Section>
);

// Template export
export const Template = EmailButton;
