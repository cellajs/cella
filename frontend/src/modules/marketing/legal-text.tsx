import { LegalSubject } from '~/modules/marketing/legal-config';
import PrivacyText from '~/modules/marketing/privacy-text';
import TermsText from '~/modules/marketing/terms-text';

const LegalText = ({ subject }: { subject: LegalSubject }) => {
  switch (subject) {
    case 'privacy':
      return <PrivacyText key={subject} />;
    case 'terms':
      return <TermsText key={subject} />;
  }
};

export default LegalText;
