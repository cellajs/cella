import { appConfig } from 'shared';
import { legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalContact } from '~/modules/auth/legal/legal-contact';
import { LegalSection } from '~/modules/auth/legal/legal-section';
import { ProcessedDataTypes } from '~/modules/auth/legal/processed-data-types';
import { Subprocessors } from '~/modules/auth/legal/subprocessors';

const sections = legalConfig.privacy.sections;
const s = (id: string) => sections.find((sec) => sec.id === id)!;

function PrivacyText() {
  const lastUpdated = 'October 19, 2026';

  const appName = appConfig.name;
  const company = appConfig.company.name;
  const supportEmail = appConfig.company.supportEmail;
  const mapHost = appConfig.mapStyleUrls.light && new URL(appConfig.mapStyleUrls.light).hostname;
  const email = (
    <a href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
      {supportEmail}
    </a>
  );

  return (
    <div id="privacy-content">
      <LegalSection id={s('overview').id} label={s('overview').label}>
        <p className="text-muted-foreground text-sm">Last updated: {lastUpdated}</p>
        <p>
          {company} ("we") runs {appName} (the "Service") for organizations. This policy explains how we handle personal data under the EU General
          Data Protection Regulation (GDPR). We are the controller of your account data. Content your organization puts in the Service is usually its
          responsibility: we process it on its behalf, under a data processing agreement.
        </p>
        <p>Questions about this policy? Contact us.</p>
        <LegalContact className="mt-8" />
      </LegalSection>

      <LegalSection id={s('how-we-use-data').id} label={s('how-we-use-data').label}>
        <p>
          We get personal data from you, from GitHub or your institution when you sign in through them, and from your use of the Service. Each use
          rests on a legal basis. Contract: we need the data to provide the Service to you and your organization (Art. 6(1)(b) GDPR). Legitimate
          interest: we need it to keep the Service secure and reliable (Art. 6(1)(f)). We do not sell your data, use it for advertising or make
          automated decisions about you.
        </p>
        <ProcessedDataTypes />
      </LegalSection>

      <LegalSection id={s('data-processing').id} label={s('data-processing').label}>
        <p>We share personal data only:</p>
        <ul>
          <li>
            <strong>Within your organization</strong>: members see your profile with your name and email address, when you were last active and the
            content you contribute. They also see the email addresses of people invited to the organization.
          </li>
          <li>
            <strong>With subprocessors</strong> that run parts of the Service for us, listed below.
          </li>
          <li>
            <strong>When the law requires it</strong>, or to protect rights and safety.
          </li>
          <li>
            <strong>In a merger, acquisition or asset sale.</strong>
          </li>
        </ul>
      </LegalSection>

      <LegalSection id={s('subprocessors').id} label={s('subprocessors').label}>
        <Subprocessors />
      </LegalSection>

      <LegalSection id={s('cookies').id} label={s('cookies').label}>
        <p>
          Our sign-in cookies keep you signed in and protect your account. One recognizes your browser for up to 400 days, so we can warn you about
          sign-ins from a new device. Your preferences and offline copies of your data stay in your browser's storage. We use no advertising cookies.
        </p>
        <ul>
          {appConfig.maplePublicIngestKey && <li>Maple, our error monitoring, sets no cookies and keeps a session id only for the open tab.</li>}
          <li>We count page visits with One Dollar Stats, which sets no cookies.</li>
          {appConfig.has.chatSupport && <li>The support chat by Gleap sets its own cookies.</li>}
          {mapHost && <li>The map on our contact form loads from {mapHost}, which receives your IP address.</li>}
        </ul>
      </LegalSection>

      <LegalSection id={s('security').id} label={s('security').label}>
        <p>
          The Service runs on servers in the EU and encrypts data in transit (TLS). Our database holds session tokens and IP addresses only as hashes,
          and roles limit who can access what. No system is perfectly secure: if a breach puts your data at risk, we inform those affected as the GDPR
          requires. Report security issues to {email}.
        </p>
      </LegalSection>

      <LegalSection id={s('your-rights').id} label={s('your-rights').label}>
        <p>
          You can ask us to access, correct, delete or export your data, to restrict its use, or object to it, and you can stop non-essential emails.
          Email {email} and we reply within one month. For content your organization controls, we pass your request on to it.
        </p>
        <p>You can also complain to a data protection authority, for example in the EU country where you live or work.</p>
      </LegalSection>

      <LegalSection id={s('changes').id} label={s('changes').label}>
        <p>We announce material changes to this policy at least two weeks in advance, by email or in the Service.</p>
      </LegalSection>
    </div>
  );
}

export { PrivacyText };
