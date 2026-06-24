import { build } from 'vite';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, 'dist', 'client');

// Build src/client.tsx as a standalone SPA bundle
await build(defineConfig({
      plugins: [react()],
      resolve: {
              alias: {
                        '@': path.join(__dirname, 'src'),
              },
      },
      build: {
              outDir: clientDir,
              emptyOutDir: false,
              rollupOptions: {
                        input: path.join(__dirname, 'src', 'client.tsx'),
                        output: {
                                    entryFileNames: 'assets/client-entry.js',
                                    chunkFileNames: 'assets/[name]-[hash].js',
                                    assetFileNames: 'assets/[name]-[hash][extname]',
                        },
              },
      },
}));

// Find existing CSS from the previous build step
const assetsDir = path.join(clientDir, 'assets');
const files = fs.readdirSync(assetsDir);
const cssFile = files.find(f => f.endsWith('.css'));

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
                              <script type="module" src="/assets/client-entry.js"></script>
                                </body>
                                </html>`;

fs.writeFileSync(path.join(clientDir, 'index.html'), html);
console.log('index.html created successfully with client-entry.js');
