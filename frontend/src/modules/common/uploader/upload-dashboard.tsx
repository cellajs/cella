import Dashboard from '@uppy/react/dashboard';
import { generateRestrictionNote } from '~/modules/common/uploader/helpers/restrictions-note';
import type { CustomUppy } from '~/modules/common/uploader/types';
import { useUIStore } from '~/modules/ui/ui-store';

import '~/modules/common/uploader/uppy-styles';

interface UploadDashboardProps {
  uppy: CustomUppy;
  autoOpen?: 'imageEditor' | null;
}

/** The Uppy Dashboard in the app's color mode, with a note on the restrictions its Uppy instance enforces. */
export function UploadDashboard({ uppy, autoOpen }: UploadDashboardProps) {
  const mode = useUIStore((state) => state.mode);

  return (
    <Dashboard
      uppy={uppy}
      autoOpen={autoOpen}
      width="100%"
      height="400px"
      theme={mode}
      note={generateRestrictionNote(uppy.opts.restrictions)}
      proudlyDisplayPoweredByUppy={false}
    />
  );
}
