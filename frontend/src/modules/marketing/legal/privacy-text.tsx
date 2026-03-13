import { Link } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { collectedData, legalConfig } from '~/modules/marketing/legal/legal-config';
import { LegalContact } from '~/modules/marketing/legal/legal-contact';
import { LegalSection } from '~/modules/marketing/legal/legal-section';
import { SharedDataTypes } from '~/modules/marketing/legal/shared-data-types';
import { Subprocessors } from '~/modules/marketing/legal/subprocessors';

const sections = legalConfig.privacy.sections;
const s = (id: string) => sections.find((sec) => sec.id === id)!;

function PrivacyText() {
  const lastUpdated = 'March 13, 2026';

  const appName = appConfig.name;
  const company = appConfig.company.name;
  const supportEmail = appConfig.company.supportEmail;

  return (
    <div id="privacy-content">
      <LegalSection id={s('overview').id} label={s('overview').label}>
        <p className="italic mb-2 pt-8">Last updated: {lastUpdated}</p>
        <p>Questions about this policy? Contact us.</p>
        <LegalContact className="mt-8" />
      </LegalSection>

      <LegalSection id={s('introduction').id} label={s('introduction').label}>
        <p>
          {company} ("we", "us", "our") operates {appName} (the "Service"). This Privacy Policy explains how we collect,
          use and protect your information. By using the Service you accept this policy and our{' '}
          <Link to="/legal" hash="terms">
            Terms of Use
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id={s('data-we-collect').id} label={s('data-we-collect').label}>
        {collectedData.map((category) => (
          <div key={category.label}>
            <h4 className="font-semibold">{category.label}</h4>
            <p>{category.description}</p>
            <ul className="my-2">
              {category.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </LegalSection>

      <LegalSection id={s('how-we-use-data').id} label={s('how-we-use-data').label}>
        <p>We use your data to:</p>
        <ul className="my-2">
          <li>Provide, maintain and improve the Service</li>
          <li>Authenticate your identity and manage your account</li>
          <li>Send service-related communications (e.g. verification, notifications)</li>
          <li>Monitor for errors and optimize performance</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>We do not sell your data or use it for advertising.</p>
      </LegalSection>

      <LegalSection id={s('data-sharing').id} label={s('data-sharing').label}>
        <p>We do not rent or sell personal information. We may share data only in these circumstances:</p>
        <ul className="my-2">
          <li>
            <strong>Within your organization</strong> — content you contribute is visible to other members of your
            organization.
          </li>
          <li>
            <strong>Subprocessors</strong> — third-party services that process data on our behalf (listed below).
          </li>
          <li>
            <strong>Legal requirements</strong> — when required by law, subpoena or to protect rights and safety.
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger, acquisition or asset sale.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id={s('cookies').id} label={s('cookies').label}>
        <p>
          We use essential cookies for authentication and session management only. We do not use third-party advertising
          or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection id={s('data-retention').id} label={s('data-retention').label}>
        <p>
          Account data is retained for as long as your account is active. When you delete your account, personal data is
          removed from the Service immediately and permanently deleted from our database within 90 days. Your
          organization may retain certain data for legal compliance purposes until they request its removal.
        </p>
      </LegalSection>

      <LegalSection id={s('security').id} label={s('security').label}>
        <p>
          We implement industry-standard security measures including encryption in transit (TLS), permission-based
          access controls and secure coding practices. However, no method of transmission or storage is 100% secure, and
          we cannot guarantee absolute security. Contact us at{' '}
          <a href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>{' '}
          for security inquiries.
        </p>
      </LegalSection>

      <LegalSection id={s('your-rights').id} label={s('your-rights').label}>
        <p>You have the right to:</p>
        <ul className="my-2">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and data</li>
          <li>Export your data</li>
          <li>Withdraw consent for data processing</li>
          <li>Opt out of non-essential email communications</li>
        </ul>
        <p>
          To exercise these rights, contact us at{' '}
          <a href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id={s('changes').id} label={s('changes').label}>
        <p>
          We may update this policy from time to time. For material changes we will provide at least two (2) weeks
          advance notice via email or an announcement on the Service. Continued use after the notice period constitutes
          acceptance.
        </p>
      </LegalSection>

      <LegalSection id={s('subprocessors').id} label={s('subprocessors').label}>
        <Subprocessors />
      </LegalSection>

      <LegalSection id={s('shared-data-types').id} label={s('shared-data-types').label}>
        <SharedDataTypes />
      </LegalSection>
    </div>
  );
}

export default PrivacyText;
