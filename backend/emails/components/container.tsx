import { Body, Container, Head, Html, Preview, Tailwind } from 'jsx-email';

interface EmailContainerProps {
  previewText: string;
  bodyStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export const EmailContainer = ({ previewText, bodyStyle, containerStyle, children }: EmailContainerProps) => (
  <Html>
    <Head />
    <Preview>{previewText}</Preview>
    <Tailwind>
      <Body style={{ backgroundColor: 'white', fontFamily: 'sans-serif', margin: 'auto', ...bodyStyle }}>
        <Container style={{ width: '30rem', margin: '0 auto', ...containerStyle }}>{children}</Container>
      </Body>
    </Tailwind>
  </Html>
);

// Template export
export const Template = EmailContainer;
