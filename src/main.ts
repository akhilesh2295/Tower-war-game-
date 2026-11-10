import './style.css';
import { App } from './ui/app';

new App();

// Offline support / "Add to Home Screen" install (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode is a nice-to-have */
    });
  });
}
