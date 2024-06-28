import { Heading } from '@react-email/components';
import { Logo } from './logo';

export const EmailHeader = ({ headerText }: { headerText: string }) => (
  <>
    <Logo />
    <Heading className="mx-0 my-[30px] p-0 text-center text-[1.5rem] font-normal text-black">
      <div>{headerText}</div>
    </Heading>
  </>
);
