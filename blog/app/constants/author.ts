type Author = {
  name: string;
  about: string;
  icon: string;
};

export const authors: { [key: string]: Author } = {
  yossydev: {
    name: 'yossydev',
    about: 'web developer',
    icon: '/static/author/yossydev.jpg',
  },
} as const;
