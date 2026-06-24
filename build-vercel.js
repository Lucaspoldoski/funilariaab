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
console.log('All assets:', files);

const cssFile = files.find(f => f.endsWith('.css'));

// The client entrypoint compiled from src/client.tsx
const clientJs = files.find(f => f.startsWith('client-') && f.endsWith('.js'));

// Fallback to any index-*.js if client.tsx was not found
const indexJs = files.find(f => /^index--/.test(f))
  || files.find(f => f.startsWith('index-') && f.endsWith('.js'));

const mainJs = clientJs || indexJs;

if (!mainJs) {
    console.error('No JS entry point found in assets!');
    console.error('Available files:', files);
    process.exit(1);
}

console.log('Using entrypoint:', mainJs);

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
