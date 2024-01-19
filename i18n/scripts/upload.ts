import fs from 'fs';
import axios from 'axios';

const main = async () => {
  console.log('Uploading frontend.json...');

  const frontendStream = fs.createReadStream('./locales/en/frontend.json');

  const frontendResponse = await axios.post(
    'https://api.simplelocalize.io/api/v2/import?uploadFormat=single-language-json&languageKey=en&namespace=frontend&REPLACE_TRANSLATION_IF_FOUND',
    {
      file: frontendStream,
    },
    {
      headers: {
        'x-simplelocalize-token': process.env.SIMPLELOCALIZE_API_KEY as string,
        'Content-Type': 'multipart/form-data',
      },
    },
  );

  console.log(JSON.stringify(frontendResponse.data, null, 2));

  console.log('Uploading backend.json...');

  const backendStream = fs.createReadStream('./locales/en/backend.json');

  const backendResponse = await axios.post(
    'https://api.simplelocalize.io/api/v2/import?uploadFormat=single-language-json&languageKey=en&namespace=backend&REPLACE_TRANSLATION_IF_FOUND',
    {
      file: backendStream,
    },
    {
      headers: {
        'x-simplelocalize-token': process.env.SIMPLELOCALIZE_API_KEY as string,
        'Content-Type': 'multipart/form-data',
      },
    },
  );

  console.log(JSON.stringify(backendResponse.data, null, 2));

  console.log('Done');
};

main();
