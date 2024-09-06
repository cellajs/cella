import { Text } from 'jsx-email';
import type React from 'react';
import { i18n } from '#/lib/i18n';

export const UserName = ({ children, userName }: { children: React.ReactNode; userName?: string }) => {
  const username = userName || i18n.t('common:unknown_name', { lng: 'en' });
  return (
    <Text
      style={{
        display: 'inline-flex',
        gap: '0,25rem',
        fontSize: '1rem',
        lineHeight: '1.5',
        color: '#000000',
      }}
    >
      {children}
      {username}
    </Text>
  );
};

export default UserName;
