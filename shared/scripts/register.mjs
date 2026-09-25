import { registerHooks } from 'node:module';
import { load, resolve } from './loader-hooks.mjs';

registerHooks({ resolve, load });
