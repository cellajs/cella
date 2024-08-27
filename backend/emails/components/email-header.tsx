import { Heading } from 'jsx-email';
import { Logo } from './logo';

export const EmailHeader = ({ headerText }: { headerText: string | React.ReactNode }) => (
  <>
    <Logo />
    <Heading
      style={{
        marginLeft: '0',
        marginRight: '0',
        marginTop: '30px',
        marginBottom: '30px',
        padding: '0',
        textAlign: 'center',
        fontSize: '1.5rem',
        fontWeight: 400,
        color: '#000000',
      }}
    >
      {typeof headerText === 'string' ? <div>{headerText}</div> : headerText}
    </Heading>
  </>
);
