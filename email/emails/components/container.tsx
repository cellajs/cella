import { Body, Container, Head, Html, Preview, Tailwind } from '@react-email/components';
import * as React from 'react';

import { cn } from '../../../frontend/src/lib/utils';

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
        <Body className={cn('bg-white font-sans', bodyClassName)}>
          <Container className={cn('', containerClassName)}>{children}</Container>
        </Body>
      </Tailwind>
    </Html>
  </React.Fragment>
);
