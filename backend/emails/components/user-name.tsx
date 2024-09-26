import { i18n } from '#/lib/i18n';

export const UserName = ({ beforeText, userName }: { beforeText?: string; userName?: string }) => {
  const username = userName || i18n.t('common:unknown_name', { lng: 'en' });
  const contentBeforeText = beforeText ? beforeText : '';

  return (
    <div
      style={{
        display: 'block',
        gap: '.25rem',
        fontSize: '1rem',
        color: '#000000',
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
      dangerouslySetInnerHTML={{
        __html: `${contentBeforeText} ${username}`,
      }}
    />
  );
};

export default UserName;
