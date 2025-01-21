export const UserName = ({ beforeText, userName }: { beforeText?: string; userName?: string }) => {
  const username = userName || '';
  const contentBeforeText = beforeText || '';

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

// Template export
export const Template = UserName;
