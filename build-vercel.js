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
console.log('All assets found:', files);

const cssFile = files.find(f => f.endsWith('.css'));

// TanStack Start entry point: index--*.js (double dash) is the main client entry
const mainJs = files.find(f => /^index--/.test(f))
  || files.find(f => /^index-/.test(f) && f.endsWith('.js'))
  || files.find(f => f.endsWith('.js'));

if (!mainJs) {
        console.error('No JS entry point found!');
        process.exit(1);
}

console.log('CSS:', cssFile);
console.log('Main JS (entry point):', mainJs);

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
      <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Funilaria AB</title>
                  ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ''}
                    </head>
                      <body>
                          <div id="root"></div>
                              <script type="module" src="/assets/${mainJs}"></script>
                                </body>
                                </html>`;

fs.writeFileSync(path.join(clientDir, 'index.html'), html);
console.log('index.html created successfully');
