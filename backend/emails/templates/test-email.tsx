import { Text } from 'jsx-email';
import { EmailContainer } from '../components/email-container';
import { EmailBody } from '../components/email-body';
import { EmailHeader } from '../components/email-header';

interface TestEmailProps {
  subject: string;
  to: string;
  recipientsNum: number;
  templateName?: string;
  originalProps?: Record<string, unknown>;
}


/**
 * Test email template used when running in test environment.
 * This template doesn't rely on i18n and provides clear test content.
 */
export const TestEmail = ({ subject, to, templateName, originalProps, recipientsNum }: TestEmailProps) => {
  return (
    <EmailContainer previewText={`[TEST] ${subject}`}>
      <EmailHeader headerText="Test Email" />
      <EmailBody>
        <Text style={{ fontWeight: 'bold', color: '#6B7280' }}>
          This is a test email
        </Text>
        <Text>
          <strong>Subject:</strong> {subject}
        </Text>
        <Text>
          <strong>Must be sended to:</strong> {recipientsNum} recepients
        </Text>
        {templateName && (
          <Text>
            <strong>Original Template:</strong> {templateName}
          </Text>
        )}
        {originalProps && (
          <Text style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            <strong>Template Props:</strong>
            <pre style={{ backgroundColor: '#F3F4F6', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto' }}>
              {JSON.stringify(originalProps, null, 2)}
            </pre>
          </Text>
        )}
      </EmailBody>
    </EmailContainer>
  );
};

// Template export
export const Template = TestEmail;
