import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import type { Plugin } from 'vite';

const compress = promisify(brotliCompress);

/** The hashed scripts and stylesheets, the bulk of what a page downloads. */
const precompressed = /^assets\/.+\.(js|mjs|css)$/;

/**
 * Vite plugin: writes a brotli copy beside each hashed script and stylesheet (`<file>.br`), which the deploy uploads and
 * Caddy serves to a browser that accepts br. Compressed once per build, it affords quality 11: about a fifth smaller than
 * the zstd Caddy applies to each response.
 */
export const precompress = (): Plugin => ({
  name: 'precompress',
  apply: 'build',
  async writeBundle({ dir }, bundle) {
    if (!dir) return;
    const files = Object.keys(bundle).filter((fileName) => precompressed.test(fileName));
    await Promise.all(
      files.map(async (fileName) => {
        const source = await readFile(join(dir, fileName));
        const params = { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: source.length };
        await writeFile(join(dir, `${fileName}.br`), await compress(source, { params }));
      }),
    );
  },
});
