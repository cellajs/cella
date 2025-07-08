import { config } from 'config';

export default function appTitle(title?: string) {
  if (!title) return config.name;
  return `${title} - ${config.name}`;
}
