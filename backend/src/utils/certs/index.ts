import { type ExecOptions, exec } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from 'config';

export function runCommand(command: string, options: ExecOptions = {}) {
  return new Promise<{ exitCode: number }>((resolve) => {
    exec(command, options, (error) => {
      return resolve({ exitCode: error?.code ?? 0 });
    });
  });
}

export const certs = async () => {
  const res = await runCommand('npx mkcert --help');

  if (res.exitCode === 0) {
    const path = dirname(new URL(import.meta.url).pathname);

    mkdirSync(path, { recursive: true });

    const keyPath = join(path, 'cert.key');
    const certPath = join(path, 'cert.crt');
    const caKeyPath = join(path, 'ca.key');
    const caCertPath = join(path, 'ca.crt');

    try {
      // Check if the CA files exist
      await Promise.all([access(caKeyPath), access(caCertPath)]);
    } catch (e) {
      // If not, create them
      await runCommand(
        `npx mkcert create-ca 
          --organization "${config.company.name}" 
          --country-code "${config.company.countryCode}" 
          --state "${config.company.state}" 
          --locality "${config.company.city}"`,
        { cwd: path },
      );
    }

    try {
      // Check if the certificate and key already exist
      await Promise.all([access(keyPath), access(certPath)]);
    } catch (e) {
      // If not, create the certificate
      await runCommand(
        `npx mkcert create-cert
          --organization "${config.company.name}"     
          --email "${config.company.email}" `,
        { cwd: path },
      );
    }
    const [key, cert] = await Promise.all([readFile(keyPath, { encoding: 'utf-8' }), readFile(certPath, { encoding: 'utf-8' })]);
    return key && cert ? { key, cert } : null;
  }
  return null;
};
