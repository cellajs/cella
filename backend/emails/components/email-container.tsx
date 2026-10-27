import { headStyles } from '../styles';
import { Body, Container, Head, Html, Preview } from './primitives';

interface EmailContainerProps {
  previewText: string;
  bodyStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  headChildren?: React.ReactNode;
  children: React.ReactNode;
}

export const EmailContainer = ({ previewText, bodyStyle, containerStyle, headChildren, children }: EmailContainerProps) => (
  <Html>
    <Head>
      <style>{headStyles}</style>
      {headChildren}
    </Head>
    <Body
      style={{
        backgroundColor: '#f5f5f5',
        fontFamily: 'sans-serif',
        margin: 'auto',
        padding: '0 0.625rem',
        ...bodyStyle,
      }}
    >
      <Preview>{previewText}</Preview>
      <Container style={{ maxWidth: '30rem', width: '100%', margin: '0 auto', ...containerStyle }}>{children}</Container>
    </Body>
  </Html>
);
