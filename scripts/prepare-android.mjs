import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';

const root = process.cwd();
const www = resolve(root, 'www');
mkdirSync(www, { recursive: true });

for (const file of ['index.html','app.js','styles.css','theme.js','language.js','manifest.json','sw.js','lucide.min.js']) {
  const source = resolve(root, file);
  if (!existsSync(source)) throw new Error(`Required web asset missing: ${file}`);
  cpSync(source, resolve(www, file));
}
if (existsSync(resolve(root, 'icons'))) cpSync(resolve(root, 'icons'), resolve(www, 'icons'), { recursive: true });

buildSync({ entryPoints: [resolve(root, 'android-notifications.js')], bundle: true, format: 'iife', outfile: resolve(www, 'native-notifications.bundle.js') });
buildSync({ entryPoints: [resolve(root, 'android-back.js')], bundle: true, format: 'iife', outfile: resolve(www, 'native-back.bundle.js') });
console.log('SmartNote Android web assets prepared in ./www');
