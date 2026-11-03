import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** One file of a frontend archive: its place under the build's output, and its content. */
export interface ArchiveFile {
  path: string;
  body: Buffer;
}

const BLOCK = 512;

const text = (header: Buffer, start: number, length: number) =>
  header
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '');

/** A path as the archive names it, refused unless it stays inside the output: relative, no `..` or empty segment, no backslash. */
function placeOf(name: string): string {
  const path = name.replace(/^(\.\/)+/, '').replace(/\/$/, '');
  const segments = path.split('/');
  if (path.startsWith('/') || path.includes('\\') || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`frontend archive: refused '${name}', which leaves the build's output`);
  }
  return path;
}

/**
 * The files of a ustar archive, as the builder writes the frontend's output (`tar --format=ustar`). The archive comes from the app's build,
 * so any entry but a plain file or a folder is refused: a link, a device or an extended header could point a later write outside the
 * folder the files are written to.
 * @throws on an entry that is neither a file nor a folder, or a path outside the output
 */
export function readUstar(archive: Buffer): ArchiveFile[] {
  const files: ArchiveFile[] = [];
  for (let offset = 0; offset + BLOCK <= archive.length; ) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    if (!text(header, 257, 6).startsWith('ustar')) throw new Error('frontend archive: not a ustar archive');
    const prefix = text(header, 345, 155);
    const name = prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100);
    const size = Number.parseInt(text(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const body = offset + BLOCK;
    if (type === '0' || type === '\0') {
      if (body + size > archive.length) throw new Error(`frontend archive: '${name}' runs past its end`);
      files.push({ path: placeOf(name), body: Buffer.from(archive.subarray(body, body + size)) });
    } else if (type === '5') {
      if (name.replace(/^(\.\/)+/, '') !== '') placeOf(name);
    } else {
      throw new Error(`frontend archive: refused '${name}', an entry of type '${type}': only files and folders`);
    }
    offset = body + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

/** Write an archive's files under `dir`, a folder of the deploy's own that holds nothing else. */
export async function writeArchiveFiles(files: readonly ArchiveFile[], dir: string): Promise<void> {
  for (const file of files) {
    const path = join(dir, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.body);
  }
}
