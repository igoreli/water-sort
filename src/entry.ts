import './style.css';
import './main';

// Offline support for the hosted build. `sw.js` is written by scripts/pwa.mjs after `vite build`.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => {}));
}
