import { type ExecOptions, exec } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const runCommand = (command: string, options: ExecOptions = {}) => {
  return new Promise<{ exitCode: number }>((resolve) => {
    exec(command, options, (error) => {
      return resolve({ exitCode: error?.code ?? 0 });
    });
  });
};

export const installRootCert = async (certPath: string) => {
  try {
    let logSuccess = false;

    // Read the certificate file content
    const certData = readFileSync(certPath, { encoding: 'utf-8' });

    // Check if the certificate already exists in the system's root trust store
    switch (process.platform) {
      case 'darwin':
        await handleMacCert(certPath, certData);
        logSuccess = true;
        break;
      case 'win32':
        await handleWindowsCert(certPath, certData);
        logSuccess = true;
        break;
      case 'linux':
        await handleLinuxCert(certPath, certData);
        logSuccess = true;
        break;
      default:
        console.info('Unsupported platform:', process.platform);
        logSuccess = false;
        return;
    }

    if (logSuccess) console.info('Root certificate installed successfully!');
  } catch (error) {
    console.error('Failed to install certificate:', error);
  }
};

const handleMacCert = async (certPath: string, certData: string) => {
  const result = await runCommand(`security find-certificate -a -c "${certData}" /Library/Keychains/System.keychain`);
  if (result.exitCode === 0) return;

  await runCommand(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
  await runCommand(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ${certPath}`);
};

const handleWindowsCert = async (certPath: string, certData: string) => {
  const result = await runCommand(
    `powershell -Command "Get-ChildItem -Path Cert:\\LocalMachine\\Root | Where-Object { $_.Thumbprint -eq (Get-FileHash -Algorithm SHA1 ${certData} | Select-Object -ExpandProperty Hash) }"`,
  );
  if (result.exitCode === 0) return;

  await runCommand(
    `powershell -Command "Start-Process powershell -ArgumentList '-Command Import-Certificate -FilePath \"${certPath}\" -CertStoreLocation Cert:\\LocalMachine\\Root' -Verb RunAs"`,
  );
};

const handleLinuxCert = async (certPath: string, certData: string) => {
  const certHash = await runCommand(`openssl x509 -in ${certData} -noout -fingerprint -sha256`);
  const certFingerprint = certHash.exitCode === 0 ? certHash : null;

  const result = await runCommand(`grep -rl ${certFingerprint} /usr/local/share/ca-certificates/`);
  if (result.exitCode === 0) return;

  await runCommand(`sudo cp ${certPath} /usr/local/share/ca-certificates/`);
  await runCommand('sudo update-ca-certificates');
};
