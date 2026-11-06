import path from 'node:path';
import { writeLocaleTypes } from './locales-plugin.ts';

// The root `postinstall` and `pnpm ts` run this: the types are not in git, and the frontend and backend typechecks import them
await writeLocaleTypes(path.resolve(import.meta.dirname, '../../shared/locales'));
