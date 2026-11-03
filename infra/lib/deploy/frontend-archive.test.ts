import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readUstar } from './frontend-archive';

/** A ustar archive of `dir`, made with the system's tar as the builder makes it. */
function archiveOf(dir: string): Buffer {
  const out = join(mkdtempSync(join(tmpdir(), 'archive-')), 'out.tar');
  const made = spawnSync('tar', ['--format=ustar', '-C', dir, '-cf', out, '.'], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(made.stderr);
  return readFileSync(out);
}

/** One ustar header and body for `name`, as a hostile archive would hold it. */
function entry(name: string, type: string, body = ''): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write('0000644\0', 100);
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write(type, 156);
  header.write('ustar\0', 257);
  const content = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  content.write(body);
  return Buffer.concat([header, content]);
}

describe('the frontend archive', () => {
  it("reads the build's files at their places", () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'ok');
    const files = readUstar(archiveOf(dir)).map((file) => [file.path, file.body.toString()]);
    expect(files.sort()).toEqual([
      ['assets/a.js', 'ok'],
      ['index.html', '<html>'],
    ]);
  });

  it("must not let the app's build reach outside its output: a link or a path that climbs out is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    writeFileSync(join(dir, 'index.html'), '<html>');
    symlinkSync('/etc/passwd', join(dir, 'leak.js'));
    expect(() => readUstar(archiveOf(dir))).toThrow(/refused/);
    expect(() => readUstar(entry('../escape.js', '0', 'x'))).toThrow(/refused/);
    expect(() => readUstar(entry('/etc/cron.d/x', '0', 'x'))).toThrow(/refused/);
    expect(() => readUstar(entry('assets', '1'))).toThrow(/refused/);
  });
});
