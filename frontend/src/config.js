/**
 * config.js — API endpoint configuration.
 *
 * All URLs come from environment variables.
 * For local dev: set values in frontend/.env
 * For production build (Vercel): set as Vercel environment variables.
 * For Android APK: set in frontend/.env then run `npm run build` before `npx cap sync`.
 */

export const API_URL = import.meta.env.VITE_API_URL;
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

if (!API_URL) {
  console.error(
    '[config] VITE_API_URL is not set. ' +
    'Create frontend/.env with VITE_API_URL=http://192.168.x.x:8000 for local dev, ' +
    'or set it as a Vercel environment variable for production.'
  );
}

if (!SOCKET_URL) {
  console.error(
    '[config] VITE_SOCKET_URL is not set. ' +
    'Create frontend/.env with VITE_SOCKET_URL=http://192.168.x.x:3001 for local dev.'
  );
}
