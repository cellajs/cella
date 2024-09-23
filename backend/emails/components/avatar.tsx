const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};
export const Avatar = ({ name, type = 'user' }: { name?: string | null; type?: 'user' | 'organization' }) => {
  let initials = 'U';
  if (name) {
    const words = name.split(' ');
    initials = words.length > 1 ? words[0].charAt(0).toUpperCase() + words[1].charAt(0).toUpperCase() : words[0].charAt(0).toUpperCase();
  }
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
        backgroundColor: getRandomColor(),
        color: '#fff',
        fontSize: '18px',
        fontWeight: 'bold',
      }}
    >
      {initials}
    </div>
  );
};

export default Avatar;
