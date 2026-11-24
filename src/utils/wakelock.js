/**
 * Safe Screen WakeLock Manager (reference-safe, non-blocking, visibility-aware).
 */

let wakeLock = null;
let wantWakeLock = false;
let listenerAttached = false;

async function acquireInternal() {
  if (!wantWakeLock || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Gracefully ignore when unsupported or battery saver blocks WakeLock
  }
}

function handleVisibilityChange() {
  if (wantWakeLock && document.visibilityState === 'visible') {
    acquireInternal();
  }
}

export function enableWakeLock() {
  wantWakeLock = true;
  if (!listenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    listenerAttached = true;
  }
  // Fire-and-forget — NEVER block initial render!
  acquireInternal();
}

export function disableWakeLock() {
  wantWakeLock = false;
  if (listenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    listenerAttached = false;
  }
  const lock = wakeLock;
  wakeLock = null;
  if (lock) {
    try {
      lock.release().catch(() => {});
    } catch {
      // Ignore
    }
  }
}
