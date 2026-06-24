#!/usr/bin/env node
// Post-build script: creates index.html in dist/client for Vercel SPA deployment
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, 'dist', 'client');
const assetsDir = path.join(clientDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('dist/client/assets not found. Run npm run build first.');
    process.exit(1);
    }

    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find(f => f.endsWith('.css'));

    // Find the main entry JS - TanStack Start generates a file with _id- prefix
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const mainJs = jsFiles.find(f => f.startsWith('_id-BKyIBFag') || f.startsWith('_id-')) 
      || jsFiles.find(f => f.startsWith('start'))
        || jsFiles[0];

        console.log('CSS:', cssFile);
        console.log('Main JS:', mainJs);

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
                                        console.log('Created dist/client/index.html');
                                        
