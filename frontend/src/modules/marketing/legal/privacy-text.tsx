import { appConfig } from 'shared';
import { monitoringEnabled } from '~/lib/monitoring';
import { LegalContact, SupportEmailLink } from '~/modules/marketing/legal/legal-contact';
import { LegalSection } from '~/modules/marketing/legal/legal-section';
import { ProcessedDataTypes, Subprocessors } from '~/modules/marketing/legal/legal-tables';

export function PrivacyText() {
  const appName = appConfig.name;
  const company = appConfig.company.name;
  const mapHost = appConfig.mapStyleUrls.light && new URL(appConfig.mapStyleUrls.light).hostname;

  return (
    <div id="privacy-content">
      <LegalSection subject="privacy" id="overview" lastUpdated="November 26, 2026">
        <p>
          {company} ("we") runs {appName} (the "Service") for organizations. This policy explains how we handle personal data under the EU General
          Data Protection Regulation (GDPR). We are the controller of your account data. Content your organization puts in the Service, such as files,
          is usually its responsibility: we process it on its behalf, under a data processing agreement.
        </p>
        <p>Questions about this policy? Contact us.</p>
        <LegalContact className="mt-8" />
      </LegalSection>

      <LegalSection subject="privacy" id="how-we-use-data">
        <p>
          We get personal data from you, from GitHub or your institution when you sign in through them, and from your use of the Service. To use the
          Service you need an email address. We process data to provide the Service to you and your organization (contract, Art. 6(1)(b) GDPR), or to
          keep it secure and reliable (legitimate interest, Art. 6(1)(f)). We do not sell your data, use it for advertising or make automated
          decisions about you.
        </p>
        {appConfig.has.demos && (
          <p>
            A demo needs no email address: it runs on a throwaway account that only your browser can open. To cap how many demos one address takes, we
            keep a hash of your IP address for a day; the demo itself goes with everything you put in it after {appConfig.retention.demoTenantDays}{' '}
            days.
          </p>
        )}
        <ProcessedDataTypes />
        <p>
          We back up the database daily and keep each backup, in the EU, for {appConfig.retention.backupDays} days, to recover from a disaster and for
          nothing else. Earlier versions of stored files are kept as long. What we remove is gone from every copy {appConfig.retention.backupDays}{' '}
          days later.
        </p>
        <p>
          When our servers report to a monitoring service, they send a record of each request they handle: its time, route, address without secrets,
          status and duration, your browser, your user id, the id and name of your organization and of its workspace, and, when our error monitoring
          runs in your browser, the random id of the page load that made it. Their log lines carry your user id, the id of your sign-in session, and
          an error's message and stack. These records leave out your IP address, passwords and sign-in tokens, and the database queries in them carry
          none of the values you entered.
        </p>
      </LegalSection>

      <LegalSection subject="privacy" id="data-processing">
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

      <LegalSection subject="privacy" id="subprocessors">
        <Subprocessors />
      </LegalSection>

      <LegalSection subject="privacy" id="cookies">
        <p>
          Our sign-in cookies keep you signed in and protect your account. One recognizes your browser for up to 400 days, so we can warn you about
          sign-ins from a new device. Your preferences and offline copies of your data stay in your browser's storage. We use no advertising cookies.
        </p>
        {(monitoringEnabled || appConfig.has.chatSupport || mapHost) && (
          <ul>
            {monitoringEnabled && (
              <li>
                Our error monitoring sets no cookies and stores nothing in your browser. For each page load it sends a random id, your browser and the
                app's release, with your user id when you are signed in. When something fails it also sends, with your user id, the error, the page's
                address and the one you came from without their secrets, your browser's language and time zone, and the steps before it: pages, the
                elements you clicked or typed in (not what you typed), requests and the app's console warnings and errors. It asks the monitoring
                service not to keep your IP address. Most requests to our servers carry the page load's random id, which the records our servers
                report of them keep.
              </li>
            )}
            {appConfig.has.chatSupport && <li>The support chat by Gleap sets its own cookies.</li>}
            {mapHost && <li>The map on our contact form loads from {mapHost}, which receives your IP address.</li>}
          </ul>
        )}
      </LegalSection>

      <LegalSection subject="privacy" id="security">
        <p>
          The Service runs on servers in the EU and encrypts data in transit (TLS). Our database holds session tokens and IP addresses only as hashes,
          and roles limit who can access what. No system is perfectly secure: if a breach puts your data at risk, we inform those affected as the GDPR
          requires. Report security issues to <SupportEmailLink />.
        </p>
      </LegalSection>

      <LegalSection subject="privacy" id="your-rights">
        <p>
          You can ask us to access, correct, delete or export your data, to restrict its use, or object to it, and you can stop non-essential emails.
          Email <SupportEmailLink /> and we reply within one month. For content your organization controls, we pass your request on to it.
        </p>
        <p>You can also complain to a data protection authority, for example in the EU country where you live or work.</p>
      </LegalSection>

      <LegalSection subject="privacy" id="changes">
        <p>We announce material changes to this policy at least two weeks in advance, by email or in the Service.</p>
      </LegalSection>
    </div>
  );
}
