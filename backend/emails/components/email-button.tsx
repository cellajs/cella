import { Button, Section } from 'jsx-email';

export const EmailButton = ({ ButtonText, href }: { ButtonText: string; href: string }) => (
  <Section style={{ textAlign: 'center', marginBottom: '2rem', marginTop: '2rem' }}>
    <Button
      height={40}
      width={200}
      style={{
        textAlign: 'center',
        background: '#000',
        color: 'white',
        padding: '0.75rem 1.25rem',
        fontSize: '.75rem',
        textDecoration: 'none',
        fontWeight: 'font-semibold',
        borderRadius: '0.25rem',
      }}
      href={href}
    >
      {ButtonText}
    </Button>
  </Section>
);
