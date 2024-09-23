import { Heading } from 'jsx-email';

export const EmailHeader = ({ headerText }: { headerText: string | React.ReactNode }) => (
  <Heading
    style={{
      margin: '1.875rem 0',
      padding: '0',
      textAlign: 'center',
      fontSize: '1.5rem',
      fontWeight: 400,
      color: '#000000',
    }}
  >
    {typeof headerText === 'string' ? <div>{headerText}</div> : headerText}
  </Heading>
);
