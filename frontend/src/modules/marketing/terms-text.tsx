import { Link } from '@tanstack/react-router';
import LegalContact from '~/modules/marketing/legal-contact';

interface TermsTextProps {
  appName: string;
  companyFull: string;
  companyShort: string;
  frontendUrl: string;
  streetAddress: string;
  city: string;
  postcode: string;
  country: string;
  supportEmail: string;
  registration: string;
  bankAccount: string;
}

const TermsText = ({
  appName,
  companyFull,
  companyShort,
  frontendUrl,
  streetAddress,
  city,
  postcode,
  country,
  supportEmail,
  registration,
  bankAccount,
}: TermsTextProps) => {
  const lastUpdated = 'September 23, 2024';

  return (
    <div className="prose dark:prose-invert text-foreground max-w-none">
      <h2 className="mb-4 font-medium">Terms of use</h2>
      <p className="italic mb-2">Last updated: {lastUpdated}</p>
      <p>Here you can read our terms of use. If you have questions or comments about them, feel free to contact us.</p>

      <LegalContact
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
          First of all, great to have you here! However, there are some rules you need to agree to before you use this application and services
          (“Services”). When we use the word “Services,” we mean the {appName} web-based application and all applications and functionalities within
          it, available through
          <a className="mx-1" href={frontendUrl} target="_blank" rel="noreferrer">
            {frontendUrl}
          </a>
          but also under sub domains and other domains of our clients, sometimes under an alternative name given by the client. If you have any
          questions, comments, or concerns regarding these Terms or the Services, please contact {companyFull}.
        </p>
      </section>

      <section className="mb-4" id="contract">
        <h3 className="font-medium" rel="noreferrer">
          Contract
        </h3>
        <p>
          These Terms of use (the “Terms”) are a binding contract between you and the owner/provider of {appName}, {companyFull}
          (henceforth called “{companyShort},”, or “we” or “us”). You must agree and accept all of the Terms, or you don’t have the right to use the
          Services. Your using the Services in any way means that you agree to all of these Terms, and these Terms will remain in effect while you use
          the Services. These Terms of use (the “Terms”) are a binding contract between you and the owner/provider of {appName}, {companyFull}
          (henceforth called “{companyShort},”, or “we” or “us”). You must agree and accept all of the Terms, or you don’t have the right to use the
          Services. Your using the Services in any way means that you agree to all of these Terms, and these Terms will remain in effect while you use
          the Services.
        </p>
        <p>
          These Terms include the provisions in this document and in the
          <Link className="ml-1" to="/legal" hash="privacy">
            Privacy policy
          </Link>
          .
        </p>
        <p>
          Our Services are constantly changing, to keep up with the dynamic needs of learners everywhere - so, these Terms might need to change, too.
          If they do change, {companyShort} will do our best to tell you in advance by placing a notification on the {appName} website, or{' '}
          {companyShort} might send you an email. In certain situations (for example, where a change to the Terms is necessary to comply with legal
          requirements), {companyShort} may not be able to give you advance notice. Changes to the
          <Link className="mx-1" to="/legal" hash="privacy">
            Privacy policy
          </Link>
          will be provided in advance.
        </p>
        <p>
          If you don’t like the new Terms, you are free to reject them - unfortunately, that means you won’t be able to use the Services anymore. If
          you use the Services in any way after a change to the Terms is effective, then please remember that means you agree to all of the Terms.
        </p>
        <p>
          Except for changes by {companyShort} as described here, no other amendment or modification of these Terms will be effective unless in
          writing and signed by both you and {companyShort}.
        </p>
      </section>

      <section className="mb-4">
        <h3 className="font-medium">Privacy</h3>
        <p>
          {companyShort} takes the privacy of its users very seriously. For the entire current {companyShort} Privacy policy, please click
          <Link className="ml-1" to="/legal" hash="privacy">
            here
          </Link>
          .
        </p>
      </section>

      <section className="mb-4" id="sign-up">
        <h3 className="font-medium">Sign up</h3>
        <p>
          First, you have to sign up for an account. You promise to provide us with accurate, complete, and updated registration information about
          yourself. You can’t select a name that you don’t have the rights to use or another person’s name with the intent to impersonate that person.
          In certain situations, your username may be selected for you by your organization; the same rules apply to them when they select a username
          for you. You may not transfer your account to anyone else without the prior written permission of {companyShort}.
        </p>
      </section>

      <section className="mb-4" id="basic-use">
        <h3 className="font-medium">Basic use</h3>
        <p>
          You represent and warrant that you are of legal age to form a binding contract (or if not, you’ve received your parent’s or guardian’s
          permission to use the Services and gotten your parent or guardian to agree to these Terms on your behalf). If you’re agreeing to these Terms
          on behalf of an organization or entity (for example, if you’re an administrator agreeing to these Terms on behalf of your organization), you
          represent and warrant that you are authorized to agree to these Terms on that organization or entity’s behalf and bind them to these Terms.
        </p>
        <p>
          You promise to only use the Services in a manner that complies with all laws that apply to you. If your use of the Services is prohibited by
          applicable laws, then you aren’t authorized to use the Services. {companyShort} can’t and won’t be responsible for you using the Services in
          a way that breaks the law.
        </p>
      </section>

      <section className="mb-4" id="intellectual-property">
        <h3 className="font-medium">Intellectual property</h3>

        <h4 className="font-medium">Content</h4>
        <p>
          The materials displayed or performed on the Services (including, but not limited to, text, graphics, articles, photos, images,
          illustrations, User Submissions (defined below), and so forth) (the “Content”) are protected by copyright and other intellectual property
          laws. You promise to abide by all copyright notices, trademark rules, information, and restrictions contained in any Content you access
          through the Services, and you won’t use, copy, reproduce, modify, translate, publish, broadcast, transmit, distribute, perform, upload,
          display, license, sell or otherwise exploit for any purpose any Content not owned by you, (i) without the prior consent of the owner of that
          Content or (ii) in a way that violates someone else’s (including {companyShort}’s) rights. For example, if someone shares a really creative
          idea with you on {appName}, that doesn’t mean you can print it out and start distributing it to other people - unless the owner specifically
          told you in writing that you could.
        </p>
        <p>
          You understand that {companyShort} owns the Services. You won’t modify, publish, transmit, participate in the transfer or sale of, reproduce
          (except as expressly provided in this Section), creative derivative works based on, or otherwise exploit any of the Services.
        </p>
        <p>
          The Services may allow you to copy or download certain Content; please remember that just because this functionality exists, doesn’t mean
          that all the restrictions above don’t apply.
        </p>

        <h4 className="font-medium">User submissions</h4>
        <p>
          Anything you post, upload, share, store, or otherwise provide through the Services is your “User Submission.” Some User Submissions are
          viewable by other users and some are submissions done as a group of users. In order to display your User Submissions on the Services, and to
          allow other users to enjoy them (where applicable), you grant us certain rights in those User Submissions. Please note that all of the
          following licenses are subject to our
          <Link className="mx-1" to="/legal" hash="privacy">
            Privacy policy
          </Link>
          to the extent they relate to User Submissions that are also your personally-identifiable information.
        </p>
        <p>
          User Submissions can only be shared within a Limited Access Group, most likely a group of organization members, or otherwise in a manner
          that only certain specified users can view (each, a “Limited Access User Submission”), then you grant {companyShort} the license above, as
          well as a license to display, perform, and distribute your Limited Access User Submission for the sole purpose of displaying that Limited
          Access User Submission to other members of that Limited Access Group (or to such specified users, as applicable) and providing you the
          Services necessary to do so. Also, you grant the other members of that Limited Access Group (or such specified users, as applicable) a
          license to access that Limited Access User Submission, and to use and exercise all rights in it, as permitted by the functionality of the
          Services.
        </p>
        <p>
          Finally, you understand and agree that {companyShort}, in performing the required technical steps to provide the Services to our users
          (including you), may need to make changes to your User Submissions to conform and adapt those User Submissions to the technical requirements
          of connection networks, devices, services, or media.
        </p>

        <h4 className="font-medium">Responsibility</h4>
        <p>
          Any information or context publicly posted or privately transmitted through the Services is the sole responsibility of the person from whom
          such context originated, and you access all such information and context at your own risk, and we aren’t liable for any errors or omissions
          in that information or context or for any damages or loss you might suffer in connection with it. We cannot control and have no duty to take
          any action regarding how you may interpret and use the Content or what actions you may take as a result of having been exposed to the
          Content, and you hereby release us from all liability for you having acquired or not acquired Content through the Services. The Services may
          contain, or direct you to websites containing, information you may find offensive or inappropriate; we can’t control that, but please let us
          know if it happens and we’ll try to remedy the situation.
        </p>
        <p>
          We also can’t guarantee the identity of any users with whom you interact in using the Services and are not responsible for which users gain
          access to the Services. But that doesn’t mean we don’t take security seriously.
        </p>
        <p>
          You are responsible for all Content you contribute, in any manner, to the Services, and you represent and warrant you have all rights
          necessary to do so, in the manner in which you contribute it. You will keep all your registration information accurate and current. You are
          responsible for all your activity in connection with the Services. Given the nature of {appName}, it is not advised to post highly personal
          or sensitive information. We also strongly advice not to share privacy-sensitive information such as healthcare information or information
          of a very personal nature.
        </p>
        <p>
          The Services may contain links or connections to third party websites or services that are not owned, operated, or controlled by{' '}
          {companyShort}. When you access third party websites or use third party services (including, without limitation, your use of Publisher
          Software, defined below), you accept that there are risks in doing so, and that {companyShort} is not responsible for such risks. We
          encourage you to be aware when you leave the Services and to read the terms and conditions and privacy policy of each third party website or
          service that you visit or utilize.
        </p>
      </section>

      <section className="mb-4" id="change-of-the-services">
        <h3 className="font-medium">Service changes</h3>
        <p>
          {appName} is a dynamic application, so the Services will change over time. We may change, suspend, or discontinue any part of the Services,
          or we may introduce new features or impose limits on certain features or restrict access to parts or all of the Services. We’ll try to give
          you notice when we make a material change to the Services that would adversely affect you, but this isn’t always practical. Similarly, we
          reserve the right to remove any Content from the Services at any time, for any reason (including, but not limited to, if someone alleges you
          contributed that Content in violation of these Terms), or without any reason, and without notice.
        </p>
      </section>

      <section className="mb-4" id="delete-account">
        <h3 className="font-medium">Account deletion</h3>
        <p>
          You’re free to delete your account at any time; please refer to our
          <Link className="ml-1" to="/legal" hash="privacy">
            Privacy policy
          </Link>
          , as well as the licenses above, to understand how we treat information you provide to us after you have stopped using our Services.
        </p>
        <p>
          {companyShort} is also free to terminate (or suspend access to) your use of the Services or your account, for any reason, including your
          breach of these Terms. {companyShort} has the sole right to decide whether you are in violation of any of the restrictions set forth in
          these Terms.
        </p>
        <p>
          Account termination may result in destruction of any Content associated with your account, so keep that in mind before you decide to
          terminate your account. We will try to provide advance notice to you prior to our terminating your account so that you are able to retrieve
          any important documents you may have stored in your account (to the extent allowed by law and these Terms), but {companyShort} may not do so
          if it determines it would be impractical, illegal, or would not be in the interest of someone’s safety or security to do so.
        </p>
        <p>
          If you have deleted your account by mistake, contact us immediately at
          <a className="mx-1" href={`mailto:${supportEmail}`} target="_blank" rel="noreferrer">
            {supportEmail}
          </a>
          - we will try to help, but unfortunately, we can’t promise that we can recover or restore anything.
        </p>
        <p>
          Provisions that, by their nature, should survive termination of these Terms shall survive termination. By way of example, all of the
          following will survive termination: any obligation you have to pay us or indemnify us, any limitations on our liability, any terms regarding
          ownership or intellectual property rights, and terms regarding disputes between us.
        </p>
      </section>

      <section className="mb-4" id="warranty-disclaimer">
        <h3 className="font-medium">Warranty disclaimer</h3>
        <p>
          {companyShort} does not make any representations or warranties concerning any context contained in or accessed through the services, and
          will not be responsible or liable for the accuracy, copyright compliance, legality, or decency of material contained in or accessed through
          the services. {companyShort} makes no representations or warranties regarding suggestions or recommendations of services or products offered
          or purchased through the services. Products and services purchased or offered (whether or not following such recommendations and
          suggestions) through the services are provided “as is” and without any warranty of any kind from {companyShort} or others (unless, with
          respect to such others only, provided expressly and unambiguously in writing by a designated third party for a specific product). The
          services, content, website, and any software are provided on an “as-is” basis, without warranties of any kind, either express or implied,
          including, without limitation, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or that use of the
          services will be uninterrupted or error-free.
        </p>
      </section>

      <section className="mb-4" id="limitation-of-liability">
        <h3 className="font-medium">Limitation of liability</h3>
        <p>
          To the fullest extent allowed by applicable law, under no circumstances and under no legal theory (including, without limitation, tort,
          contract, strict liability, or otherwise) shall {companyShort} be liable to you or to any other person for (a) any indirect, special,
          incidental, or consequential damages of any kind, including damages for lost profits, loss of goodwill, work stoppage, accuracy of results,
          or computer failure or malfunction, or (b) any amount, in the aggregate, in excess of the greater of (i) $100 or (ii) the amounts paid by
          you to {companyShort} in connection with the services in the twelve (12) month period preceding this applicable claim, or (iii) any matter
          beyond our reasonable control.
        </p>
      </section>

      <section className="mb-4" id="indemnity">
        <h3 className="font-medium">Indemnity</h3>
        <p>
          You agree to indemnify and hold {companyShort}, its affiliates, officers, agents, employees, contractors, and partners harmless for and
          against any and all claims, liabilities, damages (actual and consequential), losses, and expenses (including attorneys’ fees) arising from
          or in any way related to any third party claims relating to (a) your use of the Services (including any actions taken by a third party using
          your account), and (b) your violation of these Terms. In the event of such a claim, suit, or action (“Claim”), {companyShort} will provide
          notice of the Claim to the contact information we have for your account (provided that failure to deliver such notice shall not eliminate or
          reduce your indemnification obligations hereunder).
        </p>
      </section>

      <section className="mb-4" id="assignment">
        <h3 className="font-medium">Assignment</h3>
        <p>
          You may not assign, delegate, or transfer these Terms or your rights or obligations hereunder, or your Services account, in any way (by
          operation of law or otherwise) without {companyShort}’s prior written consent. We may transfer, assign, or delegate these Terms and our
          rights and obligations without consent.
        </p>
      </section>

      <section className="mb-4" id="choice-of-law-arbitration">
        <h3 className="font-medium">Choice of law, arbitration</h3>
        <p>
          These Terms are governed by and will be construed under the laws of the Netherlands, without regard to the conflicts of laws provisions
          thereof. Any dispute arising from or relating to the subject matter of these Terms shall be finally settled in Rotterdam, The Netherlands,
          in Dutch, by one commercial arbitrator with substantial experience in resolving intellectual property and commercial contract disputes.
          Judgment upon the award rendered by such arbitrator may be entered in any court of competent jurisdiction. Notwithstanding the foregoing
          obligation to arbitrate disputes, each party shall have the right to pursue injunctive or other equitable relief at any time, from any court
          of competent jurisdiction. For all purposes of this Agreement, the parties consent to exclusive jurisdiction and venue in The Netherlands.
        </p>
      </section>

      <section className="mb-4" id="miscellaneous">
        <h3 className="font-medium">Miscellaneous</h3>
        <p>
          You will be responsible for withholding, filing, and reporting all taxes, duties, and other governmental assessments associated with your
          activity in connection with the Services. The failure of either you or us to exercise, in any way, any right herein shall not be deemed a
          waiver of any further rights hereunder. If any provision of this Agreement is found to be unenforceable or invalid, that provision will be
          limited or eliminated, to the minimum extent necessary, so that these Terms shall otherwise remain in full force and effect and enforceable.
          You and {companyShort} agree that these Terms are the complete and exclusive statement of the mutual understanding between you and{' '}
          {companyShort}, and that it supersedes and cancels all previous written and oral agreements, communications, and other understandings
          relating to the subject matter of these Terms, and that all modifications to these Terms must be in a writing signed by both parties (except
          as otherwise provided herein). No agency, partnership, joint venture, or employment is created as a result of these Terms and you do not
          have any authority of any kind to bind {companyShort} in any respect whatsoever. You and {companyShort} agree there are no third party
          beneficiaries intended under this Agreement.
        </p>
      </section>
    </div>
  );
};

export default TermsText;
