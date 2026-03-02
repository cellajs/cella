import { Body, Container, Head, Html, Preview, Tailwind } from 'jsx-email';

interface EmailContainerProps {
  previewText: string;
  bodyStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  headChildren?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Email container component to wrap email content with consistent styling.
 */
export const EmailContainer = ({
  previewText,
  bodyStyle,
  containerStyle,
  headChildren,
  children,
}: EmailContainerProps) => (
  <Html>
    <Head>{headChildren}</Head>
    <Preview>{previewText}</Preview>
    <Tailwind>
      <Body
        style={{
          backgroundColor: '#f5f5f5',
          fontFamily: 'sans-serif',
          margin: 'auto',
          padding: '0 0.625rem',
          ...bodyStyle,
        }}
      >
        <Container style={{ maxWidth: '30rem', width: '100%', margin: '0 auto', ...containerStyle }}>
          {children}
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

// Template export
export const Template = EmailContainer;
