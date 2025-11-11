import { Link } from '@tanstack/react-router';
import sharedDataTypes from '#json/shared-data-types.json';
import subprocessors from '#json/subprocessors.json';
import CompanyContact from '~/modules/marketing/company-contact';
import SharedDataTypes from '~/modules/marketing/shared-data-types';
import Subprocessors from '~/modules/marketing/subprocessors';

type PrivacyTextProps = {
  appName: string;
  companyFull: string;
  companyShort: string;
  streetAddress: string;
  city: string;
  postcode: string;
  country: string;
  supportEmail: string;
  registration: string;
  bankAccount: string;
};

const PrivacyText = ({
  appName,
  companyFull,
  companyShort,
  streetAddress,
  city,
  postcode,
  country,
  supportEmail,
  registration,
  bankAccount,
}: PrivacyTextProps) => {
  const lastUpdated = 'September 23, 2024';

  return (
    <div className="prose dark:prose-invert text-foreground max-w-none">
      <h2 className="mb-4 font-medium">Privacy policy</h2>
      <p className="italic mb-2">Last updated: {lastUpdated}</p>
      <p>Here you can read our privacy policy. If you have questions or comments about them, feel free to contact us.</p>

      <CompanyContact
        companyFull={companyFull}
        streetAddress={streetAddress}
        city={city}
        postcode={postcode}
        country={country}
        supportEmail={supportEmail}
        registration={registration}
        bankAccount={bankAccount}
      />

      <section className="mb-4" id="introduction">
        <h3 className="font-medium">Introduction</h3>
        <p>
          {companyFull}, the owner and provider of {appName} (“{companyShort}”, “we”, “us”, “our”) takes your privacy very serious. By accessing or
          using the Services, you acknowledge that you accept the practices and policies outlined in the
          <Link className="ml-1" to="/legal" hash="terms">
            Terms of use
          </Link>
          , which incorporates this Privacy policy.
        </p>
        <p>
          Please read on to learn more about how we collect and use your information; if you have any questions or concerns regarding our privacy
          practices, please send us a detailed message to {companyShort}.
        </p>
      </section>

      <section className="mb-4" id="information-collections">
        <h3 className="font-medium">Information we store</h3>
        <p>
          {appName} is a professional service offered to organizations. The only goal of {appName} is to
          <span className="italic ml-1">manage tasks with your team and to make working on these tasks more effective</span>. For this reason, we only
          store the information that is necessary to provide this service.
        </p>

        <ul className="my-2">
          <li>User-generated tasks and todos (subtasks)</li>
          <li>Attachments (images, files, videos) uploaded by users</li>
          <li>Minimum amount of user information such as name, email, last activity date</li>
        </ul>

        <h4 className="font-medium">Information You or your Peers Provide</h4>
        <p>
          We receive and securely store data you - or the peers in your group - knowingly enter on the Services, whether via computer, mobile phone,
          other wireless device. This information may include Personal Information such as your
          <strong className="ml-1">name, user name, email address, profile picture</strong>.
        </p>

        <h4 className="font-medium">Information Collected Automatically</h4>
        <p>
          We receive and store certain types of usage information whenever you interact with the Services; this information is not Personal
          Information. For example, {companyShort} automatically receives and records information on our server logs from your browser including your
          <strong className="ml-1">{appName} user ID, browser info and the page or data you requested</strong>.
        </p>
        <p>
          Only one types of cookie are used to support this Service: to securely authenticate with the Service, {appName} requires the use of
          authentication cookies.
        </p>
        <p>
          When you use our chat support system, we will store
          <strong className="ml-1">your email, your browser version, and the pages you are visiting on {appName}</strong>. This information is only
          used to help you and advise you in using the Service.
        </p>
        <p>We store anonymous IP address records to rate limit or block traffic, ensuring a fair and secure experience for all users.</p>
      </section>

      <section className="mb-4" id="use-of-information">
        <h3 className="font-medium">Use of Information</h3>

        <h4 className="font-medium">Generally</h4>
        <p>
          When you use the Services, you may
          <span className="ml-1 italic">set up your personal profile, create workspaces, projects, and add tasks and todos in those projects</span>,
          depending on the category of user (“User Category“) you are registered as, and as permitted by the functionality of the Services. The
          information we gather from users enables us to personalize and improve our services, and allows users to set up a user account and profile
          through the Services.
        </p>

        <h4 className="font-medium">Personal Information</h4>
        <p>
          The Personal Information you provide is used for such purposes as responding to your requests for certain information and services,
          customizing your experience, and communicating with you about the Services. We will not sell or distribute Personal Information to be used
          by third parties or use this for advertising. The Service is only used for one goal:{' '}
          <span className="italic ml-1">to manage tasks with your team and to make working on these tasks more effective</span>.
        </p>

        <h4 className="font-medium">Your email address</h4>
        <p>
          If not unsubscribed, we will send you email notifications for activities such as{' '}
          <span className="italic ml-1">being mentioned in a task</span>. If somehow opting out of receiving emails from us is not working using the
          unsubscribe link in any email, please contact us at
          <a className="ml-1" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
          .
        </p>
      </section>

      <section className="mb-4" id="personal-information-sharing">
        <h3 className="font-medium">Personal Information Sharing</h3>

        <p>
          We neither rent nor sell your Personal Information; we may share your Personal Information in personally identifiable form only as described
          below.
        </p>

        <h4 className="font-medium">User Profiles</h4>
        <p>
          You may choose to populate your user profile on the Services with your name, photograph, biography. This user profile information can be
          displayed to other users to facilitate user interaction within the Services or facilitate interaction with {companyShort}. Any images,
          captions or other context that you submit to the Services in a manner any other user can view may be redistributed through the Internet and
          other media channels. For example, if you are a member, the context you contribute in your Limited Access Group(s) will be displayed to
          other members of that Limited Access Group; however, we cannot control what members of your Limited Access Group will do with such context
          after you have disclosed it.
        </p>

        <h4 className="font-medium">Business Transfers</h4>
        <p>
          If {companyShort}, or some all of its assets were acquired or otherwise transferred, or in the unlikely event that {companyShort} goes out
          of business or enters bankruptcy, user information may be transferred to or acquired by a third party.
        </p>
        <h4 className="font-medium">Protection of {companyShort} and Others</h4>

        <p>
          We may release Personal Information when we believe in good faith that release is necessary to comply with the law (such as to comply with a
          subpoena); enforce or apply our Terms of use and other agreements; or protect the rights, property, or safety of {companyShort}, our
          employees, our users, or others. We will try to give you notice if we release information for these reasons, but please understand that we
          reserve the right not to, as it may not be practical, legal, or safe to do so.
        </p>
      </section>

      <section className="mb-4" id="security">
        <h3 className="font-medium">Security</h3>
        <p>
          Your {appName} account Personal Information is protected by a password and TLS encryption for your privacy and security. We also use coding
          practices which take steps to prevent attack on our Services from web browsers and malicious scripts, by processing all actions through
          several permission verifications checks.
        </p>
        <p>
          You may help protect against unauthorized access to your account and Personal Information by selecting and protecting your password and
          secure user sessions appropriately and limiting access to your computer and browser by signing off after you have finished accessing your
          account.
        </p>
        <p>
          {companyShort} endeavors to keep your information private; however, we cannot guarantee security. Unauthorized entry or use, hardware or
          software failure, and other actionors may compromise the security of user information. For additional information about the security
          measures we use in connection with the Services, please contact us at
          <a className="ml-1" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
          .
        </p>
        <p>
          The Services contain links to other sites. We are not responsible for the privacy policies and/or practices on other sites (but you should
          read all third parties’ privacy policies to ensure you understand them). This Privacy policy only governs information collected by
          {companyShort} on the Services.
        </p>
      </section>

      <section className="mb-4" id="information-access">
        <h3 className="font-medium">Information Access</h3>
        <p>
          We allow you to access the following information about you for the purpose of viewing, and in certain situations, updating or deleting that
          information. This list may change as the Services change. You can currently access the following information:
        </p>
        <ul className="font-medium">
          <li>user profile information</li>
          <li>your organizations, workspaces and projects</li>
          <li>tasks, todos and attachments in those projects</li>
          <li>user preferences</li>
        </ul>
      </section>

      <section className="mb-4" id="personal-options">
        <h3 className="font-medium">Delete information</h3>
        <p>You can always opt not to disclose information, even though it may be needed to take advantage of certain of our features.</p>
        <p>
          You are able to update or delete certain information, as described in the section above. You may request deletion of your {appName} account.
          Deletion of account and information will remove it from the Service but not immediately from our database since your organization will
          sometimes want to retain information only for legal reasons. Accounts and information you have deleted will be permanently deleted from our
          database upon the request of your organization.
        </p>
      </section>

      <section className="mb-4" id="changes-privacy-policy">
        <h3 className="font-medium">Privacy Policy changes</h3>
        <p>
          We may make changes to this Privacy policy from time to time for any reason. Use of information we collect is subject to the Privacy policy
          in effect at the time such information is collected. If we make changes in the way we use Personal Information or Children&#39;s Personal
          Information, we will notify you via email or by posting an announcement on the Services with two (2) weeks prior notice before the change
          becomes effective. Users are bound by any changes to the Privacy policy when he or she uses the Services upon the conclusion of such two (2)
          week notice period. This notice period only applies to changes to the Privacy policy; you understand that it may not be possible in certain
          situations to provide advance notice of other changes to the Terms of use (for example, where a change to the Terms is necessary to comply
          with legal requirements).
        </p>
      </section>

      <section className="mb-4" id="subprocessors">
        <h3 className="font-medium">Subprocessors</h3>

        <Subprocessors subprocessors={subprocessors} />
      </section>

      <section className="mb-4" id="shared-data-types">
        <h3 className="font-medium">Shared Data</h3>

        <SharedDataTypes sharedDataTypes={sharedDataTypes} />
      </section>
    </div>
  );
};

export default PrivacyText;
