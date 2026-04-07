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
  'icon.png',
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

function copyStaticScripts() {
  return {
    name: 'copy-static-scripts',
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist');
      for (const file of staticFiles) {
        const source = path.resolve(rootDir, file);
        const target = path.resolve(outDir, file);

        if (!fs.existsSync(source)) continue;
        fs.copyFileSync(source, target);
      }
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: htmlEntries,
    },
  },
  plugins: [copyStaticScripts()],
});
