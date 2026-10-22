import { appConfig } from 'shared';
import { LegalContact, SupportEmailLink } from '~/modules/auth/legal/legal-contact';
import { LegalCrossLink } from '~/modules/auth/legal/legal-cross-link';
import { LegalSection } from '~/modules/auth/legal/legal-section';

function TermsText() {
  const lastUpdated = 'October 15, 2026';

  const appName = appConfig.name;
  const company = appConfig.company.name;
  const frontendUrl = appConfig.frontendUrl;

  return (
    <div id="terms-content">
      <LegalSection subject="terms" id="overview">
        <p className="text-muted-foreground text-sm">Last updated: {lastUpdated}</p>
        <p>
          These Terms of Use ("Terms") govern your use of {appName} (the "Service") at{' '}
          <a href={frontendUrl} target="_blank" rel="noreferrer">
            {frontendUrl}
          </a>
          , run by {company} ("we"). The Service is for organizations: you use it as a member of one.
        </p>
        <p>Questions about these terms? Contact us.</p>
        <LegalContact className="mt-8" />
      </LegalSection>

      <LegalSection subject="terms" id="agreement">
        <p>
          By using the Service you enter a binding agreement with {company} on these Terms. If you do not agree, do not use the Service. Our{' '}
          <LegalCrossLink subject="privacy">Privacy Policy</LegalCrossLink> explains how we handle your data. Where your organization has its own
          agreement with us, that agreement prevails.
        </p>
        <p>We announce material changes to these Terms at least two weeks in advance, by email or in the Service.</p>
      </LegalSection>

      <LegalSection subject="terms" id="accounts">
        <p>
          Your organization may set up your account or username. Give accurate details, do not impersonate anyone and do not transfer your account
          without our written consent. By using the Service you confirm that you are old enough to agree to these Terms (or have a parent's or
          guardian's consent), that you may act for any organization you represent, and that you follow applicable law.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="acceptable-use">
        <p>You agree not to:</p>
        <ul>
          <li>Violate any applicable law or regulation.</li>
          <li>Upload malicious content or introduce viruses, trojans or harmful code.</li>
          <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure.</li>
          <li>Use the Service to harass, abuse or harm others.</li>
          <li>Interfere with or disrupt the integrity or performance of the Service.</li>
          <li>Reverse-engineer the Service, except where the law or its open-source license allows it.</li>
        </ul>
        <p>
          You are responsible for the content you submit and must have the rights to it. We are not liable for content users submit. Do not share
          highly sensitive personal information through the Service.
        </p>

        <h4>Reporting content</h4>
        <p>
          Report illegal content or abuse to <SupportEmailLink />. A person reviews each report. We may remove content or suspend accounts that break
          these Terms or the law, and tell those affected what we decided and why, unless the law prevents it. They can reply to contest the decision.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="intellectual-property">
        <p>
          The Service and its original content, features and functionality are owned by {company} and protected by copyright, trademark and other
          intellectual property laws.
        </p>
        <p>
          You retain ownership of content you create. By submitting content to the Service, you grant us a limited license to store, display and
          distribute it as necessary to provide the Service.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="service-changes">
        <p>
          The Service evolves continuously. We may change, suspend or discontinue any part of the Service, introduce new features or impose limits. We
          will try to give notice of material adverse changes.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="termination">
        <p>
          You may delete your account at any time; our <LegalCrossLink subject="privacy">Privacy Policy</LegalCrossLink> says what happens to your
          data. If you deleted it by mistake, contact <SupportEmailLink />: we will try to help but cannot guarantee recovery.
        </p>
        <p>
          We may suspend or end your access for any reason, including a breach of these Terms. We will try to give notice first so you can retrieve
          important data, unless that is impractical, unlawful or unsafe. When your organization stops using the Service, it has at least 30 days to
          request its data before we delete it.
        </p>
        <p>
          Provisions that by their nature should survive termination (payment obligations, liability limitations, intellectual property, dispute
          resolution) survive.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="disclaimers">
        <p>
          To the fullest extent permitted by law, the Service is provided "as is" and "as available", without warranties of any kind, express or
          implied, including merchantability, fitness for a particular purpose or non-infringement. We do not guarantee that the Service will be
          uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="liability">
        <p>
          To the fullest extent permitted by law, {company} is not liable for indirect, special, incidental or consequential damages, and our total
          liability is limited to the greater of €100 or the amounts you paid us in the 12 months before the claim. These limits do not apply to
          damage caused by our intent or gross negligence, or to liability the law does not allow us to limit.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="indemnification">
        <p>
          To the fullest extent permitted by law, you agree to indemnify and hold {company}, its affiliates, officers, agents, employees and partners
          harmless from any claims, damages or expenses arising from your use of the Service or violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="governing-law">
        <p>
          These Terms are governed by the laws of {appConfig.company.country}, and the competent court where {company} is established decides
          disputes. Nothing in these Terms limits rights that mandatory law where you live gives you.
        </p>
      </LegalSection>

      <LegalSection subject="terms" id="general">
        <p>
          These Terms, our Privacy Policy and any agreement between your organization and us are the entire agreement about the Service. If a
          provision is unenforceable, the rest stays in force. Not enforcing a right does not waive it. You may not assign your rights under these
          Terms without our consent; we may assign ours at any time.
        </p>
      </LegalSection>
    </div>
  );
}

export { TermsText };
