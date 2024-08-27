import { Link, Section, Text } from 'jsx-email';
import { i18n } from '../src/lib/i18n';
import { EmailContainer } from './components/container';
import { Footer } from './components/footer';
import { Logo } from './components/logo';

interface Props {
  content: string;
  subject: string;
  unsubscribeLink: string;
}

export const organizationsNewsletter = ({ content, subject, unsubscribeLink }: Props) => {
  return (
    <EmailContainer
      previewText={subject}
      bodyStyle={{ padding: '0 0.625rem' }}
      containerStyle={{
        borderColor: '#f0f0f0',
        padding: '2.5rem',
        maxWidth: '100%',
        color: '#404040',
        lineHeight: '1.5',
      }}
    >
      <Logo />
      <Section>
        <Text>{subject}</Text>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: we need send it cos blackNote return an html*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </Section>
      <Link
        style={{
          fontSize: '.75rem',
          lineHeight: '1.13rem',
        }}
        href={unsubscribeLink}
      >
        {i18n.t('backend:email.unsubscribe')}
      </Link>
      <Footer />
    </EmailContainer>
  );
};

export default organizationsNewsletter;
