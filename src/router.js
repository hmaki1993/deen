/**
 * دين (Deen) - Simple Hash-Based SPA Router
 */

const routes = {};
let currentCleanup = null;

/**
 * Register a route handler
 * @param {string} path - Route pattern (e.g., '/quran/:id')
 * @param {Function} handler - Route handler function(container, params)
 */
export function route(path, handler) {
  routes[path] = handler;
}

/**
 * Navigate to a hash route
 * @param {string} hash - Hash path (e.g., '#/quran')
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Set cleanup function for current page
 */
export function setCleanup(fn) {
  currentCleanup = fn;
}

/**
 * Match current hash against registered routes
 */
function matchRoute(hash) {
  // Remove the leading #
  const path = hash.replace(/^#/, '') || '/';
  
  // Try exact match first
  if (routes[path]) {
    return { handler: routes[path], params: {} };
  }
  
  // Try pattern matching (e.g., /quran/:id)
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
      return { handler: routes[pattern], params };
    }
  }
  
  // Default to home
  return { handler: routes['/'], params: {} };
}

/**
 * Initialize the router
 * @param {HTMLElement} container - The main app container for page content
 */
export function initRouter(container) {
  function handleRoute() {
    // Run cleanup from previous page
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }
    
    let hash = window.location.hash || '#/';
    
    if (hash === '#/') {
      // Route to home by default — don't force any specific surah
      hash = '#/';
    }

    const { handler, params } = matchRoute(hash);
    
    if (handler) {
      // 1. Instant exit
      container.style.transition = 'none';
      container.style.opacity = '0';
      
      // 2. Render new page synchronously immediately
      handler(container, params);
      
      // 3. Scroll to top instantly
      window.scrollTo(0, 0);
      
      // 4. Animate entry smoothly on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
          container.style.opacity = '1';
          container.style.transform = 'translateY(0) scale(1)';
          
          setTimeout(() => {
            container.style.transform = 'none';
          }, 150);
        });
      });
    }
  }
  
  // Listen for hash changes
  window.addEventListener('hashchange', handleRoute);
  
  // Handle initial route
  handleRoute();
}
