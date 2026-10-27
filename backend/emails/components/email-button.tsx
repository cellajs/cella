import { appConfig } from 'shared';
import { Button, Section } from './primitives';

const { button, buttonEdge, buttonLabel } = appConfig.theme.email;

/**
 * The mail's one action. Its colors go through the primitive's own props: Outlook for Windows draws the button from them
 * (VML), so a color set in `style` alone leaves it an empty outline there.
 */
export const EmailButton = ({ ButtonText, href }: { ButtonText: string; href: string }) => (
  <Section style={{ textAlign: 'center', marginBottom: '2rem', marginTop: '2rem' }}>
    <Button
      align="center"
      height={38}
      width={200}
      backgroundColor={button}
      textColor={buttonLabel}
      borderColor={buttonEdge}
      borderSize={2}
      borderRadius={4}
      className="email-button"
      style={{ padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600 }}
      href={href}
    >
      {ButtonText}
    </Button>
  </Section>
);
