import { FilePanelController, type FilePanelProps } from '@blocknote/react';
import { appConfig } from 'config';
import UppyFilePanel from '~/modules/common/blocknote/custom-file-panel/uppy-upload-panel';
import type { BaseUppyFilePanelProps } from '~/modules/common/blocknote/types';

type CustomFilePanelProps = { filePanel?: (props: FilePanelProps) => React.ReactElement; baseFilePanelProps?: BaseUppyFilePanelProps };

export const CustomFilePanel = ({ filePanel: passedFilePanel, baseFilePanelProps }: CustomFilePanelProps) => {
  if (baseFilePanelProps && appConfig.has.uploadEnabled)
    return <FilePanelController filePanel={(props) => <UppyFilePanel {...baseFilePanelProps} {...props} />} />;
  if (passedFilePanel) return <FilePanelController filePanel={passedFilePanel} />;

  return <FilePanelController />;
};
