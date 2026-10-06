import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build also loads from the Capacitor WebView
  plugins: [
    {
      name: 'inline-body',
      transformIndexHtml: (html) => html.replace('<!--body-->', readFileSync('src/body.html', 'utf8')),
    },
  ],
});
