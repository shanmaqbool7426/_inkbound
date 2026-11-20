/**
 * Post-build: inline the hashed JS and CSS into one self-contained HTML file.
 * Many HTML5 game portals (and playable-ad networks) want a single .html.
 * Usage: node scripts/inline.mjs   ->   dist/inkbound.html
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

const html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = await readdir(join(dist, 'assets'));
const cssFile = assets.find((f) => f.endsWith('.css'));
const jsFile = assets.find((f) => f.endsWith('.js'));
if (!cssFile || !jsFile) throw new Error('expected one css and one js asset in dist/assets');

const css = await readFile(join(dist, 'assets', cssFile), 'utf8');
const js = (await readFile(join(dist, 'assets', jsFile), 'utf8'))
  // never let a literal </script> inside a string terminate the tag early
  .replaceAll('</script', '<\\/script');

let out = html
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/i, () => `<style>${css}</style>`)
  .replace(/<script[^>]*\ssrc="[^"]*"[^>]*><\/script>/i, () => `<script type="module">${js}</script>`);

if (out.includes('/assets/')) throw new Error('an asset reference survived inlining');
if (out === html) throw new Error('inlining made no change');

out = out.replace(
  '<head>',
  `<head>\n    <!-- INKBOUND single-file build. Source: ${basename(jsFile)} + ${basename(cssFile)} -->`,
);

const target = join(dist, 'inkbound.html');
await writeFile(target, out);
console.log(`dist/inkbound.html  ${(Buffer.byteLength(out) / 1024).toFixed(1)} kB (${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB)`);
