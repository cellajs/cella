/** A file cloud-init writes before it runs anything. */
export interface CloudConfigFile {
  path: string;
  /** Octal mode, such as `0600` for a file only root reads. */
  permissions: string;
  content: string;
}

const indent = (text: string, spaces: number) =>
  text
    .split('\n')
    .map((line) => (line ? ' '.repeat(spaces) + line : ''))
    .join('\n');

/** A `#cloud-config` document for a machine created through the Instance API: it writes `files`, then runs `commands` in order. */
export function cloudConfigDocument(files: readonly CloudConfigFile[], commands: readonly string[]): string {
  const written = files.flatMap((file) => [
    `  - path: ${file.path}`,
    `    permissions: '${file.permissions}'`,
    '    content: |',
    indent(file.content, 6),
  ]);
  return ['#cloud-config', 'write_files:', ...written, 'runcmd:', ...commands.map((command) => `  - ${command}`), ''].join('\n');
}
