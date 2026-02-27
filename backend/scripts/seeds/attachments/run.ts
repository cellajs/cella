import { attachmentsSeed } from './seed';

/**
 * Run attachments seed script.
 */
attachmentsSeed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
