import fs from 'node:fs';

// get .ts files from src/generated and add // @ts-nocheck to the top of each file
const path = 'src/generated';
const files = fs.readdirSync(path, {
  recursive: true,
  encoding: 'utf8',
});

for (const file of files) {
  if (file.endsWith('.ts')) {
    const filePath = `${path}/${file}`;
    const content = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, `// @ts-nocheck\n${content}`);
  }
}

console.log('Files prepared');
