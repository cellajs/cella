import i18n from "i18next";
import { Link, Text } from "jsx-email";

import type { BasicTemplateType } from "../types";
import { EmailLogo } from "../components/email-logo";
import { EmailContainer } from "../components/email-container";
import { EmailBody } from "../components/email-body";
import { EmailHeader } from "../components/email-header";
import { Footer } from "../components/footer";

interface NewsletterEmailProps extends BasicTemplateType {
  orgName: string;
  content: string;
}

/**
 * Email template for newsletters sent to users in one or more organizations.
 */
export const NewsletterEmail = ({ lng, content, subject, unsubscribeLink, orgName, testEmail }: NewsletterEmailProps) => {
  return (
    <EmailContainer previewText={subject}>
      <EmailHeader headerText={<div dangerouslySetInnerHTML={{ __html: i18n.t("backend:email.newsletter.title", { orgName, lng }) }} />} />
      <EmailBody>
        <Text>{testEmail && "THIS IS A TEST"}</Text>
        <Text>{subject}</Text>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>*/}
        <div dangerouslySetInnerHTML={{ __html: content }} />

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link
            style={{ fontSize: ".85rem", lineHeight: "1.13rem" }}
            href={unsubscribeLink}
          >
            {i18n.t("backend:email.unsubscribe", { lng })}
          </Link>
        </div>
      </EmailBody>

      <EmailLogo />
      <Footer />
    </EmailContainer>
  );
};

// Template export
export const Template = NewsletterEmail;
