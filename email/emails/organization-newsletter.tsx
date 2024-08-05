import { Section, Text } from '@react-email/components';
import { EmailContainer } from './components/container';
import { Footer } from './components/footer';
import { Logo } from './components/logo';

interface Props {
  content: string;
  subject: string;
}

export const organizationsNewsletter = ({ content, subject }: Props) => {
  return (
    <EmailContainer previewText={subject} bodyClassName="py-2.5" containerClassName="border-[#f0f0f0] p-12 font-light text-[#404040] leading-6">
      <Logo />
      <Section>
        <Text>{subject}</Text>
        {content}
      </Section>
      <Footer />
    </EmailContainer>
  );
};

export default organizationsNewsletter;
