import { Body, Container, Head, Html, Preview, Tailwind } from '@react-email/components';
import * as React from 'react';

interface EmailContainerProps {
  previewText: string;
  bodyClassName?: string;
  containerClassName?: string;
  children: React.ReactNode;
}

export const EmailContainer = ({ previewText, bodyClassName, containerClassName, children }: EmailContainerProps) => (
  <React.Fragment>
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className={`bg-white font-sans ${bodyClassName}`}>
          <Container className={containerClassName}>{children}</Container>
        </Body>
      </Tailwind>
    </Html>
  </React.Fragment>
);
