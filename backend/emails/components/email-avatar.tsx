import { getInitials } from 'shared/utils/get-initials';

// Each keeps white initials at 4.5:1 or more.
const avatarColors = ['#2d518c', '#6d28d9', '#0f766e', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#a21caf'];

/** One color per name, the same in every mail, so a reader recognizes the sender by it. */
const colorFor = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
};

export const EmailAvatar = ({ name, type = 'user' }: { name?: string | null; type?: 'user' | 'organization' }) => {
  let initials = getInitials(name).join('') || 'U';
  if (type === 'organization') initials = 'O';

  return (
    <div
      style={{
        verticalAlign: 'center',
        textAlign: 'center',
        width: '64px',
        height: '64px',
        lineHeight: '64px',
        borderRadius: '50%',
        backgroundColor: colorFor(name ?? ''),
        color: '#fff',
        fontSize: '18px',
        fontWeight: 'bold',
      }}
    >
      {initials}
    </div>
  );
};
