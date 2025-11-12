import { appConfig } from 'config';
import { LegalSubject } from '~/modules/marketing/legal-config';
import PrivacyText from '~/modules/marketing/privacy-text';
import TermsText from '~/modules/marketing/terms-text';

const LegalText = ({ subject }: { subject: LegalSubject }) => {
  const data = {
    appName: appConfig.name,
    companyFull: appConfig.company.name,
    companyShort: appConfig.company.name,
    frontendUrl: appConfig.frontendUrl,
    streetAddress: appConfig.company.streetAddress,
    postcode: appConfig.company.postcode,
    city: appConfig.company.city,
    country: appConfig.company.country,
    supportEmail: appConfig.company.supportEmail,
    registration: appConfig.company.registration,
    bankAccount: appConfig.company.bankAccount,
  };

  switch (subject) {
    case 'privacy':
      return <PrivacyText key={subject} {...data} />;
    case 'terms':
      return <TermsText key={subject} {...data} />;
  }
};

export default LegalText;
