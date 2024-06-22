import { Text } from '@react-email/components';
import { config } from 'config';
import { i18n } from '../../../backend/src/lib/i18n';

export const EmailReplyTo = ({ email }: { email: string }) => (
  <>
    <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px] gap-1">
      {i18n.t('backend:email.invite_reply_to')}
      <a className="ml-1" href={`mailto:${email}`}>
        {email}
      </a>
      {' or '}
      <a className="ml-1" href={`mailto:${config.supportEmail}`}>
        {config.supportEmail}
      </a>
    </Text>
    <Text className="text-[12px] leading-[18px] text-[#6a737d] mt-[20px]">{i18n.t('backend:email.invite_expire')}</Text>
  </>
);
