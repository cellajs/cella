import { Uppy } from '@uppy/core';
import '@uppy/dashboard/dist/style.min.css';
import { Dashboard } from '@uppy/react';
import { useEffect, useState } from 'react';
import { UploadType } from '~/types';
import { ImadoUppy } from '../lib/imado';

export interface UploadUppyProps {
  setUrl: (url: string) => void;
}

const uppyOptions = {
  restrictions: {
    maxFileSize: 10 * 1024 * 1024,
    maxNumberOfFiles: 1,
    allowedFileTypes: ['.jpg', '.jpeg', '.png'],
  },
};

export const UploadUppy = ({ setUrl }: UploadUppyProps) => {
  const [uppy, setUppy] = useState<Uppy | null>(null);

  useEffect(() => {
    const initializeUppy = async () => {
      const imadoUppy = await ImadoUppy(UploadType.Personal, uppyOptions, {
        public: true,
        completionHandler: (urls: URL[]) => {
          if (urls.length > 0) {
            const newImageUrl = urls[0].toString();
            console.log('Upload completed:', newImageUrl);
            setUrl(newImageUrl);
          }
        },
      });

      setUppy(imadoUppy);
    };

    initializeUppy();
  }, [setUrl]);

  return <>{uppy && <Dashboard uppy={uppy} width="100%" proudlyDisplayPoweredByUppy={false} />}</>;
};
