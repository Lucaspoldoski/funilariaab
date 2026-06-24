import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clientDir = path.join(__dirname, 'dist', 'client');
const assetsDir = path.join(clientDir, 'assets');

if (!fs.existsSync(assetsDir)) {
    console.error('dist/client/assets not found.');
    process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFiles = files.filter(f => f.endsWith('.js'));
const mainJs = jsFiles.find(f => f.startsWith('_id-')) || jsFiles[0];

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
      <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Funilaria AB</title>
                  ${cssFile ? `<link rel="stylesheet" crossorigin href="/assets/${cssFile}" />` : ''}
                    </head>
                      <body>
                          <div id="root"></div>
                              ${mainJs ? `<script type="module" crossorigin src="/assets/${mainJs}"></script>` : ''}
                                </body>
                                </html>`;

fs.writeFileSync(path.join(clientDir, 'index.html'), html);
console.log('index.html created successfully');
