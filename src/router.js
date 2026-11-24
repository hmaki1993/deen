/**
 * دين (Deen) — Hash-Based SPA Router
 * - Cancels stale transition frames on rapid navigation
 * - Uses opacity-only fade (NO transform on #page-container so position:fixed children stay anchored!)
 * - Enforces Parental Lock route guard
 * - Toggles body.reader-mode cleanly instead of expensive body:has() selectors
 */

import { getParentalLock } from './utils/storage.js';

const routes = {};
let currentCleanup = null;
let routeVersion = 0;
let transitionRaf1 = null;
let transitionRaf2 = null;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function setCleanup(fn) {
  currentCleanup = fn;
}

function matchRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';

  if (routes[path]) {
    return { handler: routes[path], params: {}, path };
  }

  for (const pattern in routes) {
    const paramNames = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${regexStr}$`);
    const match = path.match(regex);

    if (match) {
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: routes[pattern], params, path };
    }
  }

  return { handler: routes['/'], params: {}, path: '/' };
}

export function initRouter(container) {
  function handleRoute() {
    let hash = window.location.hash || '#/';

    // Enforce active Parental Lock across ALL navigation attempts
    const lock = getParentalLock();
    if (lock) {
      const allowedPrefix = `#/quran/${lock.surahNumber}`;
      if (!hash.startsWith(allowedPrefix)) {
        window.location.hash = allowedPrefix;
        return;
      }
    }

    if (transitionRaf1) cancelAnimationFrame(transitionRaf1);
    if (transitionRaf2) cancelAnimationFrame(transitionRaf2);
    routeVersion++;
    const thisVersion = routeVersion;

    if (currentCleanup) {
      try {
        currentCleanup();
      } catch (e) {
        console.warn('Route cleanup error:', e);
      }
      currentCleanup = null;
    }

    document.body.classList.remove('fullscreen-mushaf', 'modal-open');

    const { handler, params, path } = matchRoute(hash);
    const isReaderRoute = /^\/quran\/\d+/.test(path);
    document.body.classList.toggle('reader-mode', isReaderRoute);

    if (handler) {
      container.style.transition = 'none';
      container.style.opacity = '0';

      handler(container, params);
      window.scrollTo(0, 0);

      transitionRaf1 = requestAnimationFrame(() => {
        if (thisVersion !== routeVersion) return;
        transitionRaf2 = requestAnimationFrame(() => {
          if (thisVersion !== routeVersion) return;
          container.style.transition = 'opacity 0.16s ease-out';
          container.style.opacity = '1';
        });
      });
    }
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
