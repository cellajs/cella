import { Link } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { legalConfig } from '~/modules/marketing/legal/legal-config';
import { LegalContact } from '~/modules/marketing/legal/legal-contact';
import { LegalSection } from '~/modules/marketing/legal/legal-section';

const sections = legalConfig.terms.sections;
const s = (id: string) => sections.find((sec) => sec.id === id)!;

function TermsText() {
  const lastUpdated = 'March 13, 2026';

  const appName = appConfig.name;
  const company = appConfig.company.name;
  const frontendUrl = appConfig.frontendUrl;
  const supportEmail = appConfig.company.supportEmail;

  return (
    <div id="terms-content">
      <LegalSection id={s('overview').id} label={s('overview').label}>
        <p className="italic mb-2 pt-8">Last updated: {lastUpdated}</p>
        <p>Questions about these terms? Contact us.</p>
        <LegalContact className="mt-8" />
      </LegalSection>

      <LegalSection id={s('introduction').id} label={s('introduction').label}>
        <p>
          Welcome to {appName}, operated by {company} ({'"'}we{'"'}, {'"'}us{'"'}, {'"'}our{'"'}). These Terms of Use (
          {'"'}Terms{'"'}) govern your access to and use of the Service available at{' '}
          <a href={frontendUrl} target="_blank" rel="noreferrer">
            {frontendUrl}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id={s('agreement').id} label={s('agreement').label}>
        <p>
          By accessing or using the Service you agree to be bound by these Terms and our{' '}
          <Link to="/legal" hash="privacy">
            Privacy Policy
          </Link>
          . These Terms form a legally binding agreement between you and {company}. If you do not agree, do not use the
          Service.
        </p>
        <p>
          We may update these Terms from time to time. We will notify you of material changes via email or an
          announcement on the Service. Changes to pricing or features on the{' '}
          <Link to="/legal" hash="privacy">
            Privacy Policy
          </Link>{' '}
          page are always communicated in advance.
        </p>
      </LegalSection>

      <LegalSection id={s('privacy').id} label={s('privacy').label}>
        <p>
          Your use of the Service is also governed by our{' '}
          <Link to="/legal" hash="privacy">
            Privacy Policy
          </Link>
          , which describes how we collect, use and protect your data.
        </p>
      </LegalSection>

      <LegalSection id={s('accounts').id} label={s('accounts').label}>
        <p>
          You must provide accurate and complete registration information. You may not use a name you do not have the
          right to use or impersonate another person. Your organization may assign a username on your behalf. You may
          not transfer your account without our written consent.
        </p>
        <p>By creating an account you represent that:</p>
        <ul className="my-2">
          <li>You are of legal age to form a binding contract (or have parental/guardian consent).</li>
          <li>If acting on behalf of an organization, you are authorized to bind that organization to these Terms.</li>
          <li>You will use the Service only in compliance with all applicable laws.</li>
        </ul>
        <p>We are not responsible for use of the Service that violates applicable law.</p>
      </LegalSection>

      <LegalSection id={s('acceptable-use').id} label={s('acceptable-use').label}>
        <p>You agree not to:</p>
        <ul className="my-2">
          <li>Violate any applicable law or regulation.</li>
          <li>Upload malicious content or introduce viruses, trojans or harmful code.</li>
          <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure.</li>
          <li>Use the Service to harass, abuse or harm others.</li>
          <li>Interfere with or disrupt the integrity or performance of the Service.</li>
          <li>Reverse-engineer, decompile or attempt to extract the source code of the Service.</li>
        </ul>
        <p>Content you share within your organization is visible to its members.</p>

        <h4 className="font-medium">Responsibility</h4>
        <p>
          You are responsible for all content you submit and must ensure you have the necessary rights. We are not
          liable for user-generated content. Do not share highly sensitive personal information through the Service.
        </p>
      </LegalSection>

      <LegalSection id={s('intellectual-property').id} label={s('intellectual-property').label}>
        <p>
          The Service and its original content, features and functionality are owned by {company} and protected by
          copyright, trademark and other intellectual property laws.
        </p>
        <p>
          You retain ownership of content you create. By submitting content to the Service, you grant us a limited
          license to store, display and distribute it as necessary to provide the Service.
        </p>
      </LegalSection>

      <LegalSection id={s('service-changes').id} label={s('service-changes').label}>
        <p>
          The Service evolves continuously. We may change, suspend or discontinue any part of the Service, introduce new
          features or impose limits. We will try to give notice of material adverse changes.
        </p>
      </LegalSection>

      <LegalSection id={s('termination').id} label={s('termination').label}>
        <p>
          You may delete your account at any time. See our{' '}
          <Link to="/legal" hash="privacy">
            Privacy Policy
          </Link>{' '}
          for how we handle your data after termination.
        </p>
        <p>
          We may terminate or suspend your access for any reason, including breach of these Terms. We will try to
          provide advance notice so you can retrieve important data, except where impractical, illegal or unsafe.
        </p>
        <p>
          If you deleted your account by mistake, contact us at{' '}
          <a href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
          . We will try to help but cannot guarantee recovery.
        </p>
        <p>
          Provisions that by their nature should survive termination (payment obligations, liability limitations,
          intellectual property, dispute resolution) will survive.
        </p>
      </LegalSection>

      <LegalSection id={s('disclaimers').id} label={s('disclaimers').label}>
        <p>
          The Service is provided {'"'}as is{'"'} and {'"'}as available{'"'} without warranties of any kind, express or
          implied, including merchantability, fitness for a particular purpose or non-infringement. We do not guarantee
          that the Service will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection id={s('liability').id} label={s('liability').label}>
        <p>
          To the fullest extent permitted by law, {company} shall not be liable for any indirect, special, incidental or
          consequential damages. Our total liability shall not exceed the greater of $100 or the amounts you paid us in
          the 12 months preceding the claim.
        </p>
      </LegalSection>

      <LegalSection id={s('indemnification').id} label={s('indemnification').label}>
        <p>
          You agree to indemnify and hold {company}, its affiliates, officers, agents, employees and partners harmless
          from any claims, damages or expenses arising from your use of the Service or violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection id={s('governing-law').id} label={s('governing-law').label}>
        <p>These Terms are governed by the laws of {appConfig.company.country}.</p>
      </LegalSection>

      <LegalSection id={s('general').id} label={s('general').label}>
        <p>
          These Terms, together with our Privacy Policy, constitute the entire agreement between you and {company}
          regarding the Service. If any provision is found unenforceable, the remaining provisions will continue in full
          force. Our failure to enforce any right or provision does not constitute a waiver. You may not assign your
          rights under these Terms without our consent. We may assign ours at any time.
        </p>
      </LegalSection>
    </div>
  );
}

export default TermsText;
