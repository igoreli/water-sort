// Builds the whole game as one HTML fragment (title + styles + markup + script)
// for hosts that wrap the page themselves. PixiJS is loaded from a CDN.
//   node scripts/build-single.mjs           -> dist-single/water-sort.html
//   node scripts/build-single.mjs --local   -> dist-single/local.html (full page, local Pixi, strict CSP) for testing
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const local = process.argv.includes('--local');
const PIXI = 'https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist';

const out = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  plugins: [
    {
      name: 'pixi-global',
      setup(b) {
        b.onResolve({ filter: /^pixi\.js(\/unsafe-eval)?$/ }, (a) => ({ path: a.path, namespace: 'pixi-global' }));
        b.onLoad({ filter: /.*/, namespace: 'pixi-global' }, (a) => ({
          contents: a.path === 'pixi.js' ? 'module.exports = window.PIXI' : '',
        }));
      },
    },
  ],
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('src/style.css', 'utf8');
const body = readFileSync('src/body.html', 'utf8');
const src = local ? '.' : PIXI;

const page = `<title>Water Sort Puzzle</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Lilita+One&display=swap">
<style>
${css}</style>
${body}
<script src="${src}/pixi.min.js"></script>
<script src="${src}/${local ? '' : 'packages/'}unsafe-eval.min.js"></script>
<script>
${js}</script>
`;

mkdirSync('dist-single', { recursive: true });
if (local) {
  for (const f of ['pixi.min.js', 'packages/unsafe-eval.min.js']) copyFileSync(`node_modules/pixi.js/dist/${f}`, `dist-single/${f.split('/').pop()}`);
  writeFileSync(
    'dist-single/local.html',
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'">
<style>:root{box-sizing:border-box;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>
</head><body>${page}</body></html>`,
  );
} else writeFileSync('dist-single/water-sort.html', page);
console.log('built', local ? 'dist-single/local.html' : 'dist-single/water-sort.html', Math.round(page.length / 1024) + ' KB');
