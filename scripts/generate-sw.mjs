// Genera out/sw.js tras `next build` con la lista de todos los archivos exportados,
// para que la app funcione sin conexión. La versión cambia con el contenido.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('out');
const SKIP = new Set(['sw.js', '_headers', '_redirects', '404.html']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return files.flat();
}

const files = (await walk(OUT))
  .map((f) => path.relative(OUT, f).split(path.sep).join('/'))
  .filter((f) => !SKIP.has(f) && !f.endsWith('.txt') && !f.endsWith('.map'))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(await readFile(path.join(OUT, f)));
const version = hash.digest('hex').slice(0, 12);

// index.html se sirve como "/" o "/ruta/" (trailingSlash: true).
const urls = files.map((f) => '/' + f.replace(/(^|\/)index\.html$/, '$1'));

const template = await readFile(path.resolve('scripts/sw-template.js'), 'utf8');
const sw = template
  .replace('__VERSION__', JSON.stringify(version))
  .replace('__PRECACHE__', JSON.stringify(urls, null, 2));
await writeFile(path.join(OUT, 'sw.js'), sw);
console.log(`sw.js: ${urls.length} archivos, versión ${version}`);
