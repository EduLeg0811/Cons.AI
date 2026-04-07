import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = __dirname;
const htmlEntries = fs
  .readdirSync(rootDir)
  .filter((file) => file.endsWith('.html'))
  .reduce((entries, file) => {
    entries[file.replace(/\.html$/i, '')] = path.resolve(rootDir, file);
    return entries;
  }, {});

const staticFiles = [
  'config.js',
  'utils.js',
  'messages.js',
  'display.js',
  'bridge.js',
  'download.js',
  'script_biblio_verbete.js',
  'script_biblio_wv.js',
  'script_mancia.js',
  'script_ragbot.js',
  'script_search_book.js',
];

function syncStaticFiles() {
  return {
    name: 'sync-static-files',
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist');

      for (const file of staticFiles) {
        const source = path.resolve(rootDir, file);
        const target = path.resolve(outDir, file);

        if (!fs.existsSync(source)) continue;
        fs.copyFileSync(source, target);
      }

      const htmlFiles = fs
        .readdirSync(outDir)
        .filter((file) => file.endsWith('.html'));

      for (const file of htmlFiles) {
        const target = path.resolve(outDir, file);
        const html = fs.readFileSync(target, 'utf8');
        const normalized = html.replace(/\/assets\/icon-[^"']+\.png/gi, '/icon.png');
        if (normalized !== html) {
          fs.writeFileSync(target, normalized, 'utf8');
        }
      }
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: htmlEntries,
    },
  },
  plugins: [syncStaticFiles()],
});
